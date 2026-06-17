using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// ─────────────────────────────────────────────────────────────────────────────
//  Cash Buddy EPA — Lanzador de escritorio
//
//  Arranca el backend (node dist/index.js) y abre el sistema en una ventana
//  propia tipo app (WebView2). CLAVE: espera a que el servidor responda en el
//  puerto 4000 ANTES de navegar, mostrando una pantalla de "Iniciando…".
//  Así nunca aparece el error "this site can't be reached" del navegador.
// ─────────────────────────────────────────────────────────────────────────────

class CashBuddy
{
    const string AppId = "ZENBYTE.CashBuddyEPA";
    const string Host = "127.0.0.1";
    const int Port = 4000;
    static readonly string Url = "http://localhost:" + Port;
    static readonly string ProjectDir = @"C:\cash-buddy-epa";

    [DllImport("shell32.dll", SetLastError = true)]
    static extern void SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string AppID);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetDllDirectory(string lpPathName);

    static string SupportDir
    {
        get
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "CashBuddyEPA");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    [STAThread]
    static void Main()
    {
        try { SetCurrentProcessExplicitAppUserModelID(AppId); } catch { }

        // 1) Resolver los DLLs administrados de WebView2 desde los recursos embebidos.
        AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbedded;

        // 2) Extraer el loader nativo y registrarlo en la ruta de búsqueda de DLLs.
        ExtractNativeLoader();

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        // 3) Arrancar el backend solo si el puerto no está ya en uso (instancia única).
        if (!IsPortOpen())
            StartBackend();

        Application.Run(new MainForm());
    }

    // ── Resolución de ensamblados embebidos (Core / WinForms) ──────────────────
    static Assembly ResolveEmbedded(object sender, ResolveEventArgs args)
    {
        var name = new AssemblyName(args.Name).Name;
        string res = null;
        if (name == "Microsoft.Web.WebView2.Core") res = "wv2.Core.dll";
        else if (name == "Microsoft.Web.WebView2.WinForms") res = "wv2.WinForms.dll";
        if (res == null) return null;

        using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(res))
        {
            if (s == null) return null;
            var buf = new byte[s.Length];
            s.Read(buf, 0, buf.Length);
            return Assembly.Load(buf);
        }
    }

    // ── Extraer WebView2Loader.dll (nativo) a la carpeta de soporte ────────────
    static void ExtractNativeLoader()
    {
        try
        {
            var path = Path.Combine(SupportDir, "WebView2Loader.dll");
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("wv2.Loader.dll"))
            {
                if (s != null)
                {
                    bool write = !File.Exists(path) || new FileInfo(path).Length != s.Length;
                    if (write)
                    {
                        var buf = new byte[s.Length];
                        s.Read(buf, 0, buf.Length);
                        File.WriteAllBytes(path, buf);
                    }
                }
            }
            SetDllDirectory(SupportDir);
        }
        catch { /* si falla, WebView2 intentará usar el loader del runtime del sistema */ }
    }

    // ── Backend: node dist/index.js, separado, con salida a archivo de log ─────
    static void StartBackend()
    {
        try
        {
            var apiDir = Path.Combine(ProjectDir, "apps", "api");
            var log = Path.Combine(ProjectDir, "cashbuddy-launcher.log");
            // Lanzado vía cmd /c con redirección a archivo: el proceso node queda
            // independiente del lanzador (no muere si se cierra la ventana) y no
            // depende de un pipe de salida que se rompa.
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c node dist\\index.js > \"" + log + "\" 2>&1",
                WorkingDirectory = apiDir,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            psi.EnvironmentVariables["NODE_ENV"] = "production";
            Process.Start(psi);
        }
        catch { /* MainForm mostrará el error si nunca responde el puerto */ }
    }

    // ── ¿El puerto 4000 acepta conexiones? ─────────────────────────────────────
    static bool IsPortOpen()
    {
        try
        {
            using (var c = new TcpClient())
            {
                var ar = c.BeginConnect(Host, Port, null, null);
                bool ok = ar.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(400));
                if (ok) { c.EndConnect(ar); return true; }
                return false;
            }
        }
        catch { return false; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Ventana principal: muestra "Iniciando…" hasta que el servidor responde,
    //  luego carga la app. Si la navegación falla, reintenta.
    // ─────────────────────────────────────────────────────────────────────────
    class MainForm : Form
    {
        WebView2 web;
        Panel loading;
        Label status;
        bool navigated;

        public MainForm()
        {
            Text = "Cash Buddy EPA";
            Width = 1280;
            Height = 800;
            StartPosition = FormStartPosition.CenterScreen;
            WindowState = FormWindowState.Maximized;
            BackColor = Color.FromArgb(15, 23, 42);
            try
            {
                var icoPath = Path.Combine(ProjectDir, "CashBuddy.exe");
                Icon = Icon.ExtractAssociatedIcon(icoPath);
            }
            catch { }

            // Pantalla de carga
            loading = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(15, 23, 42) };
            status = new Label
            {
                Text = "Iniciando Cash Buddy EPA…\nEsperando el servidor, no cierres esta ventana.",
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 14F, FontStyle.Regular),
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Fill,
            };
            loading.Controls.Add(status);
            Controls.Add(loading);

            web = new WebView2 { Dock = DockStyle.Fill, Visible = false };
            Controls.Add(web);

            Load += async (s, e) => await StartAsync();
        }

        async Task StartAsync()
        {
            // 1) Esperar a que el puerto responda (hasta ~90 s).
            bool ready = false;
            for (int i = 0; i < 180; i++)
            {
                if (IsPortOpen()) { ready = true; break; }
                if (i == 20)
                    SetStatus("Iniciando Cash Buddy EPA…\nEl primer arranque puede tardar un poco.");
                await Task.Delay(500);
            }

            if (!ready)
            {
                SetStatus("No se pudo iniciar el servidor.\n\nVerifica que PostgreSQL esté activo y que se haya\nejecutado \"npm run build\". Revisa cashbuddy-launcher.log.");
                return;
            }

            // 2) Inicializar WebView2 con carpeta de datos propia.
            try
            {
                var env = await CoreWebView2Environment.CreateAsync(null, SupportDir);
                await web.EnsureCoreWebView2Async(env);
            }
            catch (Exception ex)
            {
                SetStatus("No se pudo iniciar la vista de la app.\nInstala el WebView2 Runtime (viene con Windows 11).\n\n" + ex.Message);
                return;
            }

            // 3) Reintentar la navegación si falla (servidor aún calentando).
            web.CoreWebView2.NavigationCompleted += (s, e) =>
            {
                if (!e.IsSuccess && !navigated)
                {
                    // WebErrorStatus: error de conexión → reintentar tras un momento.
                    var t = new Timer { Interval = 800 };
                    t.Tick += (s2, e2) => { t.Stop(); t.Dispose(); try { web.CoreWebView2.Navigate(Url); } catch { } };
                    t.Start();
                }
                else if (e.IsSuccess && !navigated)
                {
                    navigated = true;
                    web.Visible = true;
                    loading.Visible = false;
                }
            };

            web.CoreWebView2.Navigate(Url);
        }

        void SetStatus(string text)
        {
            if (status.InvokeRequired) status.Invoke(new Action(() => status.Text = text));
            else status.Text = text;
        }
    }
}
