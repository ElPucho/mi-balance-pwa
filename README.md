# Mi balance

PWA móvil para registrar manualmente ingresos, gastos, ahorro y previsiones. Está pensada para instalarse en un iPhone desde Safari y utilizarse como una aplicación normal, sin pasar por la App Store.

## Funciones principales

- Panel mensual con ingresos, gastos, ahorro y disponible.
- Registro y edición manual de movimientos.
- Movimientos confirmados o previstos.
- Presupuesto mensual y objetivo de ahorro configurables.
- Cierre de mes con fotografía y notas.
- Análisis mensual, evolución anual y simulador de ahorro.
- Gastos futuros fraccionados en aportaciones mensuales, sin descontarlos dos veces al pagarlos.
- Inicio personalizable con widgets y gráficos opcionales.
- Instalación PWA y funcionamiento sin conexión.
- Copia local separada para cada cuenta mediante IndexedDB.
- Sincronización entre dispositivos con Supabase.

## Ejecutar en local

Requiere Node.js 22.13 o posterior.

```bash
npm install
npm run dev
```

Para validar la versión de producción:

```bash
npm test
```

## Acceso privado por invitación

No hay registro público. Para dar acceso a una o dos personas:

1. Abre **Supabase → Authentication → Users → Add user → Create new user**.
2. Introduce el correo del invitado y una contraseña inicial segura.
3. Marca el correo como confirmado y entrega la contraseña al invitado por un canal privado.
4. El invitado entra desde la pantalla inicial con su correo y contraseña.

También se mantiene el acceso mediante código para usuarios ya creados. La aplicación usa `shouldCreateUser: false`, de modo que escribir un correo desconocido no crea una cuenta.

Las políticas RLS de PostgreSQL limitan todas las operaciones al identificador del usuario conectado. El almacenamiento del móvil y la cola sin conexión también están separados por cuenta.

## GitHub Pages

El flujo `.github/workflows/pages.yml` construye y publica la PWA automáticamente después de cada cambio en `main`. El repositorio puede ser público porque solo contiene el código y una clave publicable de Supabase; los datos privados siguen protegidos por autenticación y RLS. Nunca debe añadirse una clave `service_role` al repositorio.

En GitHub, configura **Settings → Pages → Source: GitHub Actions**. En Supabase añade la dirección de GitHub Pages a **Authentication → URL Configuration → Redirect URLs** para que el acceso por código pueda regresar a la aplicación.

## Supabase

IndexedDB se conserva como copia local y cola de cambios: la aplicación continúa funcionando sin conexión y sube las operaciones pendientes cuando vuelve Internet.

Para un entorno local, copia `.env.example` a `.env.local` y completa la URL y la clave pública del proyecto. No se utilizan ni se exponen claves administrativas.

## Planificación, registro rápido y recuperación

- **Inicio → Cuánto puedo gastar:** saldo real menos salidas pendientes y la parte todavía no reservada del objetivo de ahorro. No anticipa ingresos pendientes. El margen semanal respeta el presupuesto general si existe. Son estimaciones basadas únicamente en lo registrado.
- **Formulario → Guardar como favorito:** guarda un atajo, no un movimiento. Los favoritos rellenan concepto, importe y categoría; siempre hay que confirmar. Las sugerencias de previsiones requieren selección explícita.
- **Formulario → Repetir como previsión:** intervalos mensuales, trimestrales, anuales o de 1–120 meses. La app genera un horizonte móvil de 12 meses, con identificadores estables para evitar duplicados. No genera pagos reales. Editar una ocurrencia permite cambiar solo ella o sus previsiones siguientes; los meses cerrados y las previsiones consumidas se protegen. Eliminar una ocurrencia registra una omisión.
- **Ajustes → Series:** pausar solo detiene nuevas generaciones; las ya creadas permanecen. Quitar futuras detiene la serie y elimina solo previsiones futuras sin consumo. Reanudar vuelve a preparar el horizonte salvo las omisiones individuales.
- **Ajustes → Presupuestos por categoría:** límites con remanente opcional desde el mes de alta. Solo se acumulan meses consecutivos cerrados. Los cambios de límite conservan el histórico y no aumentan retroactivamente remanentes. Un límite no es un gasto y no se añade al saldo ni al arrastre de previsiones.
- **Ajustes → Copias:** JSON completo con vínculos, cierres, favoritos, presupuestos y series; vista previa y confirmación para restaurar. La restauración reemplaza los datos de la cuenta actual. Los archivos no contienen claves ni sesiones, pero sí datos financieros: guardarlos de forma privada. El CSV es para consultar en Excel, no para restaurar.
- **Deshacer:** último cambio de este dispositivo, incluso después de recargar; conserva datos no afectados y rechaza cambios posteriores detectados. Con Supabase requiere conexión y sincronización previa para comprobar otros dispositivos. No es un historial completo ni una copia de seguridad automática.
- **Análisis → Ver y ajustar:** abre los movimientos que sostienen cada consejo. El cierre mensual incluye revisión de previsiones y presupuestos.

Favoritos, series, límites y widgets se sincronizan en `profiles.preferences`, una columna JSON protegida por las mismas políticas RLS de propietario. Las operaciones locales y su cola de sincronización se guardan juntas en una transacción IndexedDB. La copia completa sigue disponible aunque la nube no esté configurada.
