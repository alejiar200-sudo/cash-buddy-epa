using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// =============================================================================
//  Cash Buddy EPA — Lanzador de escritorio v2 (auto-recovery)
//
//  Secuencia de arranque:
//    1. Registrar en inicio de Windows (registro + tarea programada)
//    2. Verificar / iniciar PostgreSQL
//    3. Verificar / iniciar Backend Node.js
//    4. Esperar /api/health (DB conectada)
//    5. Abrir WebView2
//    6. Monitor de salud cada 30 s → reinicio automático si el servidor cae
//
//  Todo fallo muestra: componente exacto, causa, acción tomada, resultado.
// =============================================================================

class CashBuddy
{
    // ── Constantes ──────────────────────────────────────────────────────────────
    const string AppId           = "ZENBYTE.CashBuddyEPA";
    const string Host            = "127.0.0.1";
    const int    AppPort         = 4000;
    const int    PgPort          = 5432;
    const int    MaxRestarts     = 5;
    const int    HealthIntervalMs = 30000;

    static readonly string AppUrl     = "http://localhost:" + AppPort;
    // Ruta del proyecto = carpeta donde está el propio CashBuddy.exe. Así funciona
    // en cualquier PC (C:\cash-buddy-epa, C:\EPA DOMICILIOS\cash-buddy-epa, etc.)
    // sin tener que recompilar con una ruta fija.
    static readonly string ProjectDir = System.IO.Path.GetDirectoryName(
        System.Reflection.Assembly.GetExecutingAssembly().Location);
    static readonly string LogFile    = System.IO.Path.Combine(ProjectDir, "cashbuddy-launcher.log");
    static readonly object LogLock    = new object();

    static readonly string[] PgServiceNames = new string[]
    {
        "postgresql-x64-17", "postgresql-x64-16", "postgresql-x64-15",
        "postgresql-x64-14", "postgresql-x64-13", "postgresql", "PostgreSQL"
    };

    // ── Estado global del backend ────────────────────────────────────────────────
    static Process backendProcess = null;
    static int     restartCount   = 0;
    static bool    watchdogActive = false;
    static readonly object ProcLock = new object();

    // ── Resultado simple (reemplaza tuplas que no soporta C# 5) ─────────────────
    struct Result
    {
        public bool   Ok;
        public string Error;
        public static Result Success()              { var r = new Result(); r.Ok = true;  r.Error = null;  return r; }
        public static Result Fail(string msg)       { var r = new Result(); r.Ok = false; r.Error = msg;   return r; }
    }

    // ── DllImports ───────────────────────────────────────────────────────────────
    [DllImport("shell32.dll", SetLastError = true)]
    static extern void SetCurrentProcessExplicitAppUserModelID(
        [MarshalAs(UnmanagedType.LPWStr)] string AppID);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetDllDirectory(string lpPathName);

    // ── Punto de entrada ─────────────────────────────────────────────────────────
    [STAThread]
    static void Main()
    {
        RotateLog();
        Log("================================================");
        Log("  Cash Buddy EPA iniciando");
        Log("================================================");

        try { SetCurrentProcessExplicitAppUserModelID(AppId); } catch { }

        AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbedded;
        ExtractNativeLoader();
        RegisterWindowsAutostart();

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }

    // ── Logging ──────────────────────────────────────────────────────────────────
    static void Log(string msg)
    {
        string line = "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + msg;
        lock (LogLock)
        {
            try { File.AppendAllText(LogFile, line + "\r\n", Encoding.UTF8); } catch { }
        }
    }

    static void RotateLog()
    {
        try
        {
            if (File.Exists(LogFile) && new FileInfo(LogFile).Length > 5 * 1024 * 1024)
            {
                string prev = LogFile.Replace(".log", "-prev.log");
                if (File.Exists(prev)) File.Delete(prev);
                File.Move(LogFile, prev);
            }
        }
        catch { }
    }

    // ── Autostart en Windows ─────────────────────────────────────────────────────
    static void RegisterWindowsAutostart()
    {
        try
        {
            string exe = Application.ExecutablePath;
            Microsoft.Win32.RegistryKey key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", true);
            if (key == null) return;
            key.SetValue("CashBuddyEPA", "\"" + exe + "\"");
            key.Close();
            Log("[Autostart] Registrado en inicio de Windows: " + exe);
        }
        catch (Exception ex)
        {
            Log("[Autostart] No se pudo registrar: " + ex.Message);
        }
    }

    // ── WebView2 assembly resolving ───────────────────────────────────────────────
    static Assembly ResolveEmbedded(object sender, ResolveEventArgs args)
    {
        string name = new AssemblyName(args.Name).Name;
        string res  = null;
        if (name == "Microsoft.Web.WebView2.Core")       res = "wv2.Core.dll";
        else if (name == "Microsoft.Web.WebView2.WinForms") res = "wv2.WinForms.dll";
        if (res == null) return null;

        using (System.IO.Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(res))
        {
            if (s == null) return null;
            byte[] buf = new byte[s.Length];
            s.Read(buf, 0, buf.Length);
            return Assembly.Load(buf);
        }
    }

    static string SupportDir
    {
        get
        {
            string dir = System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "CashBuddyEPA");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    static void ExtractNativeLoader()
    {
        try
        {
            string path = System.IO.Path.Combine(SupportDir, "WebView2Loader.dll");
            using (System.IO.Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("wv2.Loader.dll"))
            {
                if (s != null)
                {
                    bool write = !File.Exists(path) || new FileInfo(path).Length != s.Length;
                    if (write)
                    {
                        byte[] buf = new byte[s.Length];
                        s.Read(buf, 0, buf.Length);
                        File.WriteAllBytes(path, buf);
                    }
                }
            }
            SetDllDirectory(SupportDir);
        }
        catch { }
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  PostgreSQL
    // ════════════════════════════════════════════════════════════════════════════

    static string FindPgService()
    {
        foreach (string name in PgServiceNames)
            if (ServiceExists(name)) return name;
        return null;
    }

    static bool ServiceExists(string svc)
    {
        string output = RunCmd("sc.exe", "query \"" + svc + "\"");
        return output.Contains("SERVICE_NAME");
    }

    static string GetServiceState(string svc)
    {
        string output = RunCmd("sc.exe", "query \"" + svc + "\"");
        if (output.Contains("RUNNING"))       return "RUNNING";
        if (output.Contains("STOPPED"))       return "STOPPED";
        if (output.Contains("START_PENDING")) return "START_PENDING";
        return "UNKNOWN";
    }

    static void SetServiceAutoStart(string svc)
    {
        RunCmd("sc.exe", "config \"" + svc + "\" start= auto");
        Log("[PostgreSQL] Servicio '" + svc + "' configurado como inicio automatico");
    }

    static Result EnsurePostgres(Action<string> status)
    {
        status("[PostgreSQL] Buscando servicio de base de datos...");
        Log("[PostgreSQL] Buscando servicio...");

        string svcName = FindPgService();

        if (svcName == null)
        {
            if (IsPortListening(Host, PgPort))
            {
                Log("[PostgreSQL] Puerto 5432 activo (instalacion no-servicio)");
                status("[PostgreSQL] OK — Puerto 5432 activo");
                return Result.Success();
            }
            string err =
                "No se encontro ningun servicio Windows de PostgreSQL\n" +
                "y el puerto 5432 no responde.\n\n" +
                "Verifica que PostgreSQL este instalado correctamente.";
            Log("[PostgreSQL] ERROR: " + err);
            return Result.Fail(err);
        }

        Log("[PostgreSQL] Servicio encontrado: " + svcName);
        status("[PostgreSQL] Servicio: " + svcName);

        try { SetServiceAutoStart(svcName); } catch { }

        string state = GetServiceState(svcName);
        Log("[PostgreSQL] Estado: " + state);

        if (state == "RUNNING" || IsPortListening(Host, PgPort))
        {
            status("[PostgreSQL] OK — Ya esta activo");
            return Result.Success();
        }

        // Iniciar el servicio
        status("[PostgreSQL] Iniciando " + svcName + "... (puede tardar ~15 s)");
        Log("[PostgreSQL] Ejecutando: net start \"" + svcName + "\"");
        RunCmd("net.exe", "start \"" + svcName + "\"");

        // Esperar hasta 30 s
        for (int i = 0; i < 60; i++)
        {
            if (GetServiceState(svcName) == "RUNNING" || IsPortListening(Host, PgPort))
            {
                status("[PostgreSQL] OK — Servicio iniciado correctamente");
                Log("[PostgreSQL] Activo tras " + (i * 500) + " ms");
                return Result.Success();
            }
            Thread.Sleep(500);
        }

        string errMsg =
            "El servicio '" + svcName + "' no respondio en 30 segundos.\n\n" +
            "Accion tomada: Se ejecuto 'net start " + svcName + "'\n" +
            "Estado actual: " + GetServiceState(svcName) + "\n\n" +
            "Revisa los logs de PostgreSQL en:\n" +
            @"C:\Program Files\PostgreSQL\17\data\log\";
        Log("[PostgreSQL] ERROR: " + errMsg);
        return Result.Fail(errMsg);
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  Backend Node.js
    // ════════════════════════════════════════════════════════════════════════════

    static void StartBackend()
    {
        lock (ProcLock)
        {
            try
            {
                if (backendProcess != null && !backendProcess.HasExited)
                {
                    backendProcess.Kill();
                    backendProcess.WaitForExit(3000);
                }
            }
            catch { }

            string apiDir = System.IO.Path.Combine(ProjectDir, "apps", "api");
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName               = "cmd.exe",
                Arguments              = "/c node dist\\index.js",
                WorkingDirectory       = apiDir,
                UseShellExecute        = false,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                CreateNoWindow         = true,
            };
            psi.EnvironmentVariables["NODE_ENV"] = "production";

            Process p = new Process { StartInfo = psi, EnableRaisingEvents = true };
            p.OutputDataReceived += (s, e) => { if (e.Data != null) Log("[Backend] " + e.Data); };
            p.ErrorDataReceived  += (s, e) => { if (e.Data != null) Log("[Backend-ERR] " + e.Data); };
            p.Exited             += OnBackendExited;

            p.Start();
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();

            backendProcess = p;
            Log("[Backend] Iniciado PID=" + p.Id);
        }
    }

    static void OnBackendExited(object sender, EventArgs e)
    {
        int code = -1;
        try { code = (sender as Process).ExitCode; } catch { }
        Log("[Backend] Proceso termino con codigo " + code);

        if (!watchdogActive) return;

        if (restartCount >= MaxRestarts)
        {
            Log("[Backend] Se alcanzo el limite de " + MaxRestarts + " reinicios automaticos.");
            return;
        }

        restartCount++;
        Log("[Backend] Reinicio automatico #" + restartCount + " en 3 s...");
        Thread.Sleep(3000);
        StartBackend();
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  Utilidades de red
    // ════════════════════════════════════════════════════════════════════════════

    static bool IsPortListening(string host, int port)
    {
        try
        {
            using (TcpClient c = new TcpClient())
            {
                IAsyncResult ar = c.BeginConnect(host, port, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(600))) return false;
                c.EndConnect(ar);
                return true;
            }
        }
        catch { return false; }
    }

    static bool IsAppPortOpen() { return IsPortListening(Host, AppPort); }

    static Result CheckHealth()
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(
                "http://localhost:" + AppPort + "/api/health");
            req.Timeout = 5000;
            req.Method  = "GET";
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            {
                int code = (int)resp.StatusCode;
                bool ok  = code >= 200 && code < 300;
                return ok ? Result.Success() : Result.Fail("HTTP " + code);
            }
        }
        catch (WebException ex)
        {
            if (ex.Response != null)
            {
                int code = (int)((HttpWebResponse)ex.Response).StatusCode;
                return Result.Fail("HTTP " + code + ": " + ex.Message);
            }
            return Result.Fail(ex.Message);
        }
        catch (Exception ex)
        {
            return Result.Fail(ex.Message);
        }
    }

    static string RunCmd(string exe, string args)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(exe, args)
            {
                UseShellExecute        = false,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                CreateNoWindow         = true,
            };
            using (Process p = Process.Start(psi))
            {
                string output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
                p.WaitForExit(15000);
                return output;
            }
        }
        catch (Exception ex) { return ex.Message; }
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  Ventana principal
    // ════════════════════════════════════════════════════════════════════════════
    class MainForm : Form
    {
        WebView2  web;
        Panel     loadingPanel;
        Label     titleLbl;
        Label     stepLbl;
        RichTextBox logBox;
        Panel     overlay;
        Label     overlayLbl;

        bool navigated = false;
        System.Windows.Forms.Timer healthTimer;
        int  healthFails = 0;
        const int MaxHealthFails = 3;

        public MainForm()
        {
            Text          = "Cash Buddy EPA";
            Width         = 1280;
            Height        = 800;
            StartPosition = FormStartPosition.CenterScreen;
            WindowState   = FormWindowState.Maximized;
            BackColor     = Color.FromArgb(15, 23, 42);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            BuildLoadingPanel();
            BuildWebView();
            BuildOverlay();

            Load += async (s, e) => await Task.Run((Action)RunStartupSequence);
        }

        // ── Construccion de UI ────────────────────────────────────────────────────

        void BuildLoadingPanel()
        {
            loadingPanel = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(15, 23, 42) };

            titleLbl = new Label
            {
                Text      = "Cash Buddy EPA",
                ForeColor = Color.FromArgb(99, 179, 237),
                Font      = new Font("Segoe UI", 24F, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter,
                Dock      = DockStyle.Top,
                Height    = 70,
                Padding   = new Padding(0, 16, 0, 0),
            };

            stepLbl = new Label
            {
                Text      = "Iniciando...",
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 11F),
                TextAlign = ContentAlignment.MiddleCenter,
                Dock      = DockStyle.Top,
                Height    = 36,
            };

            logBox = new RichTextBox
            {
                Dock        = DockStyle.Fill,
                BackColor   = Color.FromArgb(15, 23, 42),
                ForeColor   = Color.FromArgb(148, 163, 184),
                Font        = new Font("Consolas", 9F),
                ReadOnly    = true,
                BorderStyle = BorderStyle.None,
                ScrollBars  = RichTextBoxScrollBars.Vertical,
                Padding     = new Padding(40, 8, 40, 8),
            };

            loadingPanel.Controls.Add(logBox);
            loadingPanel.Controls.Add(stepLbl);
            loadingPanel.Controls.Add(titleLbl);
            Controls.Add(loadingPanel);
        }

        void BuildWebView()
        {
            web = new WebView2 { Dock = DockStyle.Fill, Visible = false };
            Controls.Add(web);
        }

        void BuildOverlay()
        {
            overlay = new Panel
            {
                Dock      = DockStyle.Fill,
                BackColor = Color.FromArgb(210, 15, 23, 42),
                Visible   = false,
            };
            overlayLbl = new Label
            {
                Text      = "",
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 14F),
                TextAlign = ContentAlignment.MiddleCenter,
                Dock      = DockStyle.Fill,
            };
            overlay.Controls.Add(overlayLbl);
            Controls.Add(overlay);
            overlay.BringToFront();
        }

        // ── Helpers de UI (seguros para hilos) ───────────────────────────────────

        void SetStep(string text)
        {
            Log("[Paso] " + text);
            SafeInvoke(delegate { stepLbl.Text = text; });
        }

        void AppendLog(string line, Color col)
        {
            Log("[UI] " + line);
            SafeInvoke(delegate
            {
                logBox.SelectionColor = col;
                logBox.AppendText(line + "\n");
                logBox.ScrollToCaret();
            });
        }

        void AppendOk(string line)   { AppendLog("  OK  " + line, Color.FromArgb(74, 222, 128)); }
        void AppendErr(string line)  { AppendLog("  XX  " + line, Color.FromArgb(252, 129, 74));  }
        void AppendInfo(string line) { AppendLog("      " + line, Color.FromArgb(148, 163, 184)); }
        void AppendHead(string line) { AppendLog(line, Color.FromArgb(99, 179, 237)); }

        void ShowFatalError(string component, string cause, string action, string detail)
        {
            string msg =
                "[" + component + "] ERROR\n\n" +
                "Causa: " + cause + "\n" +
                "Accion tomada: " + action +
                (detail != null ? "\n\nDetalle tecnico:\n" + detail : "");

            Log("FATAL [" + component + "]: " + cause);

            SafeInvoke(delegate
            {
                stepLbl.Text      = msg;
                stepLbl.ForeColor = Color.FromArgb(252, 129, 74);
                stepLbl.Height    = 240;
                stepLbl.TextAlign = ContentAlignment.TopCenter;
            });
        }

        void SetOverlay(string msg, bool visible)
        {
            SafeInvoke(delegate
            {
                overlayLbl.Text = msg;
                overlay.Visible = visible;
                if (visible) overlay.BringToFront();
            });
        }

        void SafeInvoke(Action action)
        {
            try
            {
                if (IsHandleCreated && InvokeRequired) Invoke(action);
                else if (IsHandleCreated) action();
            }
            catch { }
        }

        // ════════════════════════════════════════════════════════════════════════
        //  Secuencia de arranque (corre en hilo de fondo)
        // ════════════════════════════════════════════════════════════════════════
        void RunStartupSequence()
        {
            // ── Paso 1: PostgreSQL ────────────────────────────────────────────────
            AppendHead("=== PASO 1/4 — Base de datos (PostgreSQL) ===");
            SetStep("Paso 1/4 — Verificando PostgreSQL...");

            Result pg = EnsurePostgres(delegate(string msg) { SetStep(msg); AppendInfo(msg); });

            if (!pg.Ok)
            {
                AppendErr("PostgreSQL no se pudo iniciar");
                ShowFatalError(
                    "PostgreSQL",
                    pg.Error,
                    "Se intento iniciar el servicio Windows de PostgreSQL",
                    "Abre PowerShell como Administrador y ejecuta:\n" +
                    "  net start postgresql-x64-17\n\n" +
                    "Si el error persiste, verifica la instalacion de PostgreSQL.");
                return;
            }
            AppendOk("PostgreSQL activo");

            // ── Paso 2: Backend Node.js ───────────────────────────────────────────
            AppendHead("\n=== PASO 2/4 — Servidor (Node.js) ===");
            SetStep("Paso 2/4 — Verificando servidor Node.js...");

            if (IsAppPortOpen())
            {
                AppendOk("Servidor ya estaba activo en puerto 4000");
            }
            else
            {
                AppendInfo("Iniciando servidor Node.js...");
                StartBackend();
                watchdogActive = true;
                AppendOk("Proceso Node.js iniciado");
            }

            // ── Paso 3: Esperar respuesta del servidor ────────────────────────────
            AppendHead("\n=== PASO 3/4 — Esperando respuesta del servidor ===");
            SetStep("Paso 3/4 — Esperando que el servidor este listo...");

            bool serverReady = false;
            for (int i = 0; i < 180; i++)
            {
                if (IsAppPortOpen()) { serverReady = true; break; }
                if (i == 10) { SetStep("Paso 3/4 — Iniciando modulos (primer arranque ~20 s)..."); }
                if (i == 50) { SetStep("Paso 3/4 — Cargando, por favor espera..."); }
                if (i == 100)
                {
                    AppendInfo("Tardando mas de lo esperado. Verifica cashbuddy-launcher.log");
                    SetStep("Paso 3/4 — Tardando mas de lo normal...");
                }
                Thread.Sleep(500);
            }

            if (!serverReady)
            {
                bool pgStill   = IsPortListening(Host, PgPort);
                bool nodeAlive = false;
                lock (ProcLock)
                    try { nodeAlive = backendProcess != null && !backendProcess.HasExited; } catch { }

                string cause =
                    !pgStill  ? "PostgreSQL dejo de responder durante el arranque del backend" :
                    !nodeAlive ? "El proceso Node.js se cerro inesperadamente (revisa el log)" :
                                 "El servidor no respondio en 90 segundos";

                AppendErr("Servidor no respondio a tiempo");
                ShowFatalError(
                    "Servidor",
                    cause,
                    "Se espero 90 segundos verificando el puerto 4000",
                    "PostgreSQL activo: " + pgStill + "\n" +
                    "Node.js corriendo: " + nodeAlive + "\n\n" +
                    "Log completo en:\n" + LogFile);
                return;
            }
            AppendOk("Puerto 4000 activo");

            // ── Paso 4: Verificar /api/health ────────────────────────────────────
            AppendHead("\n=== PASO 4/4 — Verificando conexion con la base de datos ===");
            SetStep("Paso 4/4 — Verificando base de datos...");

            bool   healthOk     = false;
            string healthDetail = "";
            for (int i = 0; i < 6; i++)
            {
                Result h = CheckHealth();
                if (h.Ok) { healthOk = true; break; }
                healthDetail = h.Error;
                Thread.Sleep(2000);
            }

            if (healthOk)
                AppendOk("Base de datos conectada");
            else
                AppendInfo("Advertencia: /api/health no respondio OK (" + healthDetail + ") — se abre igualmente");

            // ── Abrir WebView2 ────────────────────────────────────────────────────
            AppendHead("\n[Sistema] Abriendo Cash Buddy EPA...");
            SetStep("Abriendo Cash Buddy EPA...");

            SafeInvoke(async delegate
            {
                await InitWebViewAsync();
                StartHealthMonitor();
            });
        }

        // ════════════════════════════════════════════════════════════════════════
        //  WebView2
        // ════════════════════════════════════════════════════════════════════════
        async Task InitWebViewAsync()
        {
            try
            {
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, SupportDir);
                await web.EnsureCoreWebView2Async(env);
            }
            catch (Exception ex)
            {
                ShowFatalError(
                    "WebView2",
                    "No se pudo inicializar el motor de visualizacion",
                    "Se intento crear el entorno CoreWebView2",
                    "Instala WebView2 Runtime (incluido en Windows 11).\n" + ex.Message);
                return;
            }

            web.CoreWebView2.NavigationCompleted += (s, e) =>
            {
                if (!e.IsSuccess && !navigated)
                {
                    System.Windows.Forms.Timer t = new System.Windows.Forms.Timer { Interval = 800 };
                    t.Tick += (s2, e2) =>
                    {
                        t.Stop(); t.Dispose();
                        try { web.CoreWebView2.Navigate(AppUrl); } catch { }
                    };
                    t.Start();
                }
                else if (e.IsSuccess && !navigated)
                {
                    navigated = true;
                    web.Visible          = true;
                    loadingPanel.Visible = false;
                    Log("[WebView2] Navegacion exitosa — sistema listo");
                }
            };

            web.CoreWebView2.Navigate(AppUrl);
        }

        // ════════════════════════════════════════════════════════════════════════
        //  Monitor de salud post-arranque (cada 30 s)
        // ════════════════════════════════════════════════════════════════════════
        void StartHealthMonitor()
        {
            healthTimer = new System.Windows.Forms.Timer { Interval = HealthIntervalMs };
            healthTimer.Tick += async (s, e) => await HealthTickAsync();
            healthTimer.Start();
            Log("[Monitor] Monitor de salud iniciado (intervalo 30 s)");
        }

        async Task HealthTickAsync()
        {
            bool portOk = IsAppPortOpen();

            if (portOk)
            {
                if (healthFails > 0)
                {
                    healthFails = 0;
                    Log("[Monitor] Conexion restaurada");
                    SetOverlay("", false);
                    SafeInvoke(delegate { try { web.CoreWebView2.Reload(); } catch { } });
                }
                return;
            }

            healthFails++;
            Log("[Monitor] Fallo #" + healthFails + ": puerto " + AppPort + " no responde");

            if (healthFails < MaxHealthFails)
            {
                SetOverlay(
                    "Verificando conexion con el servidor... (" + healthFails + "/" + MaxHealthFails + ")",
                    true);
                return;
            }

            // 3 fallos consecutivos → recuperacion automatica
            Log("[Monitor] 3 fallos consecutivos — iniciando recuperacion automatica...");
            restartCount = 0;

            // 1. Verificar PostgreSQL
            SetOverlay("Recuperando sistema — verificando PostgreSQL...", true);
            Result pg = EnsurePostgres(delegate(string msg) { Log("[Monitor-PG] " + msg); });

            if (!pg.Ok)
            {
                SetOverlay(
                    "ERROR: PostgreSQL no responde.\n\n" +
                    "El sistema no puede funcionar sin base de datos.\n" +
                    "Intenta reiniciar el computador.", true);
                Log("[Monitor] No se pudo recuperar PostgreSQL");
                return;
            }

            // 2. Reiniciar backend
            SetOverlay("Recuperando sistema — reiniciando servidor...", true);
            StartBackend();
            Log("[Monitor] Backend reiniciado, esperando respuesta...");

            // 3. Esperar hasta 60 s
            bool recovered = false;
            for (int i = 0; i < 60; i++)
            {
                await Task.Delay(1000);
                if (IsAppPortOpen()) { recovered = true; break; }
            }

            if (recovered)
            {
                healthFails = 0;
                Log("[Monitor] Sistema recuperado exitosamente");
                SetOverlay("Servidor restaurado — recargando...", true);
                await Task.Delay(1500);
                SetOverlay("", false);
                SafeInvoke(delegate { try { web.CoreWebView2.Reload(); } catch { } });
            }
            else
            {
                Log("[Monitor] No se pudo recuperar el servidor tras reinicio");
                SetOverlay(
                    "No se pudo reconectar con el servidor.\n\n" +
                    "Revisa el archivo de log:\n" + LogFile + "\n\n" +
                    "O reinicia el computador para restaurar el sistema.", true);
            }
        }
    }
}
