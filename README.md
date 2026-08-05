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
