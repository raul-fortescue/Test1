# Forte · H&S Workspace

Tablero personal para revisar conversaciones de Outlook y seguir próximas acciones. Node.js 24.10 o posterior, sin dependencias externas, Python ni Ollama. Interfaz en español, vistas de tablero/lista y almacenamiento SQLite en el servidor.

## Inicio local

```sh
cd /workspace/Test1
npm start
```

En otro equipo, usá la carpeta donde hayas clonado este repositorio. Abrí el puerto 3000 en tu navegador local. No requiere `npm install` ni compilar. `npm test` ejecuta las pruebas de persistencia, sincronización y API HTTP. No crees worktrees para tareas habituales: cada tarea en la nube ya está aislada; usá el checkout existente.

Sin configuración de Microsoft 365, la aplicación inicia vacía y muestra **Conexión pendiente**. No tiene datos ficticios ni reconstruye los registros históricos del PDF. Para recuperar estados, notas y respuestas anteriores hacen falta los JSON/Excel originales y un importador de migración adaptado a su estructura; no están incluidos en el PDF.

## Conectar Outlook (requiere TI de Microsoft 365)

1. Registrar una aplicación de un solo tenant en Microsoft Entra ID y configurar autenticación de aplicación para Microsoft Graph.
2. Autorizar exclusivamente lectura de correo para el buzón elegido. La API utilizada requiere `Mail.Read` de aplicación o el rol equivalente mediante Exchange Online Application RBAC. TI debe restringir el acceso al buzón autorizado mediante Application RBAC o una política de acceso compatible; los permisos de Entra sin restricciones pueden conceder acceso a más buzones. No se necesita `Mail.Send` ni permisos de escritura. TI debe verificar el alcance efectivo antes de conectar datos reales.
3. Copiar `.env.example` a `.env` o configurar las variables en el gestor de secretos del proveedor. Completar `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` y `MS_MAILBOX`. Nunca cargar secretos en GitHub ni pegarlos en un chat. Rotar el secreto antes de su vencimiento.
4. Reiniciar `npm start`. La primera sincronización comienza automáticamente; el botón **Actualizar ahora** también ejecuta la consulta. Un mensaje de error no adelanta el último corte de revisión.

Destinos HTTPS necesarios: `login.microsoftonline.com` y `graph.microsoft.com`. Node usa el proxy heredado con `--use-env-proxy`; se conserva la verificación TLS. Las variables configuradas en el servidor nunca se entregan al navegador.

### Qué sincroniza esta versión

- Solo **Bandeja de entrada** del buzón indicado. Primera consulta: últimos 30 días. Después consulta desde el último corte exitoso con cinco minutos de solapamiento. No lee adjuntos, subcarpetas, enviados ni correos movidos fuera de la bandeja antes de la consulta.
- Consulta automática cada cinco minutos (configurable, mínimo un minuto). El navegador consulta el servidor cada 15 segundos. Es actualización periódica, **no tiempo real mediante webhooks**. El servidor debe permanecer ejecutándose.
- Agrupa por `conversationId` y conserva el mensaje entrante más reciente. Los nuevos casos ingresan como **Por confirmar / Sin clasificar**. Los usuarios eligen prioridad: gerencia, equipo interno, contratistas. No se infiere jerarquía del remitente.
- Conserva estados, notas, responsable y borradores manuales. Una nueva entrada marca la conversación para revisar. No cierra tareas por una respuesta ni elimina las tareas antiguas al vencer la ventana de 30 días.
- El borrador de respuesta es editable. **No incluye un clasificador ni generador de respuestas con IA**; no determina automáticamente qué mensajes exigen respuesta. Tampoco envía correos, aprueba compras ni carga SAP.
- Pagina hasta 100 páginas de 100 mensajes por consulta. Si falla una página, no incorpora parcialmente esa consulta ni adelanta el corte. Los errores de límite se muestran y requieren ajustar el proceso si el buzón supera ese volumen. Ante 429 vuelve a intentar en el ciclo siguiente; no hace reintentos inmediatos.

Para reproducir el agente original falta integrar un proceso de análisis autorizado que distinga pedidos, respuestas y evidencia de resolución; el PDF por sí solo no proporciona ese proceso. Esta base resuelve almacenamiento, consulta de correo y seguimiento manual sin importaciones recurrentes.

## Datos y respaldo

`DATA_DIR` (por defecto `./data`) contiene `hys.sqlite` y sus archivos WAL. Montá un volumen persistente al desplegar: el disco efímero de un contenedor perdería las tareas. Para respaldar con herramientas de archivos, detené **esta aplicación** y copiá el directorio completo; para respaldos sin detenerla usá la API de backup de SQLite. Guardá copias cifradas fuera de Git y verificá su recuperación. Eliminar un correo de Outlook no lo borra del tablero; la retención debe definirse antes de uso organizacional.

## Publicación privada

GitHub aloja el código. **GitHub Pages no ejecuta este servidor ni protege el acceso a correo corporativo**. Desplegá Node 24.10+ en un servicio privado con HTTPS y volumen persistente, o inicialmente ejecutalo en tu equipo.

La opción elegida para la nube es **Azure App Service con Microsoft Entra ID**. Ver [guía de despliegue privado](docs/azure.md). El servidor incluye autorización para tenant y usuarios explícitos mediante la identidad validada por App Service Authentication. La infraestructura Azure aún debe configurarse; no hay un sitio público ni una conexión real al buzón verificada.

- Para acceso remoto: `HOST=0.0.0.0`, `DASHBOARD_TOKEN` aleatorio de al menos 32 caracteres y `PUBLIC_ORIGIN` con el origen HTTPS exacto (sin barra final). La API requiere esa clave y el navegador la conserva solo durante la sesión de la pestaña.
- La clave compartida es una protección básica para un prototipo personal. Para uso corporativo, usar el modo Entra descrito en la guía, restringir usuarios y red, agregar auditoría y acordar retención/respaldos con TI. No hay separación por usuario: quien accede ve el mismo buzón y tareas.
- No exponer el puerto directamente a Internet sin HTTPS y controles privados. No subir correo, bases de datos, PDFs corporativos ni `.env` a GitHub. Los datos de la aplicación están excluidos mediante `.gitignore`.
- En Windows instalá Node 24.10+ y usá `npm.cmd start` desde Símbolo del sistema si la política corporativa restringe scripts de PowerShell. No hace falta cambiar esa política.

## Variables

| Variable | Uso |
| --- | --- |
| `HOST`, `PORT` | Por defecto `127.0.0.1`, `3000` |
| `DATA_DIR` | Directorio persistente de SQLite |
| `SYNC_INTERVAL_MINUTES` | Frecuencia de Outlook; por defecto 5 |
| `MS_TENANT_ID`, `MS_CLIENT_ID` | Identificadores de la aplicación aprobada |
| `MS_CLIENT_SECRET` | Secreto del servidor, nunca del navegador |
| `MS_MAILBOX` | Correo del buzón autorizado |
| `DASHBOARD_TOKEN` | Clave para el acceso al tablero |
| `PUBLIC_ORIGIN` | Origen HTTPS detrás del proxy inverso |

## Validación

`npm test` usa Microsoft Graph simulado y una base temporal, sin consultar correos reales. La conexión real requiere configuración y una consulta exitosa; tener las variables presentes no prueba acceso. El estado de la interfaz informa último éxito y último error por separado. El código no solicita ni guarda permisos de envío.
