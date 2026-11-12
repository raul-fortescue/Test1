# Despliegue privado con Microsoft 365

Destino propuesto: Azure App Service Linux, contenedor Node 24, autenticación Microsoft Entra ID de un solo tenant. El repositorio incluye un Dockerfile; el despliegue y la conexión real no se ejecutaron en el entorno de desarrollo. Este documento describe pasos pendientes, no una publicación completada.

## Recursos y permisos previos

TI necesita una suscripción Azure, un App Service con almacenamiento persistente y dos registros de aplicación de Entra: uno para inicio de sesión del tablero y otro para lectura limitada del buzón mediante Graph. Separarlos permite revocar lectura sin afectar el inicio de sesión. El servidor conserva un único tablero compartido: habilitá inicialmente solo tu usuario.

## Preparación en Azure

1. Construir la imagen del Dockerfile en un registro privado aprobado. Desplegarla en App Service Linux. No introducir secretos como argumentos de compilación ni copiar `.env` o `data` en la imagen. El Dockerfile no instala paquetes externos.
2. Configurar puerto de contenedor 3000, HTTPS obligatorio y una única instancia de aplicación. Establecer `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true` y montar almacenamiento persistente en `/home`; garantizar que el usuario `node` pueda escribir en `/home/hys`. Verificar persistencia tras reiniciar y preparar respaldos. No usar múltiples instancias con este SQLite.
3. En **Authentication**, agregar el proveedor Microsoft de tu tenant, requerir autenticación para **todas las solicitudes** y redirigir las no autenticadas al inicio de sesión. Configurar el callback `https://<tu-app>/.auth/login/aad/callback` y la audiencia del registro de inicio de sesión. Restringir la aplicación empresarial a usuarios asignados y asignarte como usuario autorizado. No habilitar acceso anónimo.
4. Activar `AUTH_MODE=azure-easyauth` **solo** en ese App Service. Este modo confía en el encabezado de identidad que valida e inyecta Azure. No publicar el contenedor por una ruta que evite Authentication, ni usar este modo en un servidor que admita encabezados de identidad del cliente sin verificar. El código comprueba además tenant y lista explícita de cuentas.
5. Configurar estas variables en App Service:

| Nombre | Valor |
| --- | --- |
| `AUTH_MODE` | `azure-easyauth` |
| `HOST` | `0.0.0.0` |
| `PORT`, `WEBSITES_PORT` | `3000` |
| `PUBLIC_ORIGIN` | `https://<tu-app>` sin barra final |
| `DATA_DIR` | `/home/hys` |
| `MS_TENANT_ID` | Identificador del tenant corporativo |
| `ALLOWED_USER_EMAILS` | Tu cuenta corporativa autorizada; separadas por coma si agregás usuarios |
| `MS_CLIENT_ID` | Aplicación de lectura de correo, no la aplicación de login |
| `MS_CLIENT_SECRET` | Referencia segura a Key Vault para esa aplicación |
| `MS_MAILBOX` | Buzón al que TI limitó la lectura |
| `SYNC_INTERVAL_MINUTES` | `5` |

El secreto del proveedor de inicio de sesión se configura en App Service Authentication; no debe confundirse con `MS_CLIENT_SECRET`. No se necesita `DASHBOARD_TOKEN` en este modo. La API no acepta esa clave como alternativa al login corporativo.

6. Autorizar Graph `Mail.Read`/Exchange Application RBAC limitado al buzón, según README. Permitir salida HTTPS a Microsoft Graph y Microsoft login. Activar **Always On** en un plan compatible para mantener las consultas periódicas. Sin ello, un servicio suspendido no sincroniza mientras no hay visitas.

## Comprobaciones obligatorias antes de usar correo real

- Visita sin sesión: redirige al login corporativo y no entrega tareas. Cuenta de otro tenant o no asignada: acceso denegado. Cuenta autorizada: puede abrir el tablero.
- Verificar que no exista ruta al contenedor que eluda Authentication y que los encabezados de identidad no puedan falsificarse mediante esa ruta.
- Confirmar el alcance del buzón con TI. Ejecutar **Actualizar ahora**, comprobar fecha y remitentes en Outlook y validar que un fallo de permisos se muestra sin modificar el corte anterior.
- Editar una tarea, reiniciar App Service y comprobar que conserva notas y estado. Verificar backup y recuperación antes del uso sostenido.
- Mantener secretos fuera de logs y del repositorio. Revisar política de retención, acceso y auditoría de correo con TI.

No se publica un sitio de GitHub Pages: el servidor, autenticación y SQLite necesitan ejecución y almacenamiento del lado de Azure. El modo Entra se validó con identidades simuladas en pruebas; falta validar Authentication y Graph en el tenant real.
