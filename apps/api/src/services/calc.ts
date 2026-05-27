// El cálculo puro vive en @cash-buddy/shared (fuente única compartida con el
// frontend). Se re-exporta aquí por conveniencia para los servicios del API.
export {
  dayBalances,
  balancesAtEndOfDay,
  courierStatusForDay,
  deliveriesForDay,
} from "@cash-buddy/shared";
