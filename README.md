# Forte · H&S Workspace local

Tablero personal de pendientes de Outlook que funciona **solo en tu computadora**. La página y la base de datos se ejecutan en el equipo; GitHub guarda únicamente el código. No necesita hosting, Azure App Service, Docker, Python ni Ollama.

## Inicio en Windows

1. Instalá **Node.js 24.10 o posterior** desde [nodejs.org](https://nodejs.org), respetando las políticas de tu equipo.
2. En [GitHub](https://github.com/raul-fortescue/Test1), seleccioná **Code → Download ZIP** y extraé todos los archivos en una carpeta local con permisos de escritura. También podés clonar el repositorio.
3. Hacé doble clic en **`Iniciar-HYS.cmd`**. Inicia el servidor local y abre el navegador cuando está listo. Mantené abierta la ventana mientras lo uses; cerrala para detenerlo.

No requiere instalar paquetes, compilar ni cambiar la política de PowerShell. Si no se abre el navegador, usá la dirección indicada en la ventana (por defecto `http://127.0.0.1:3000`). Si el puerto está ocupado, cerrá una instancia anterior del tablero o elegí otro `PORT` en `.env`; no detengas servicios ajenos.

El primer inicio funciona sin configurar Outlook: muestra el tablero vacío y **Conexión con Outlook pendiente**. No se incluyen datos ficticios ni registros reconstruidos del PDF.

## Conectar Outlook

Que la aplicación sea local no le concede acceso automático al correo corporativo. La conexión actual usa Microsoft Graph y requiere autorización de Microsoft 365 por TI; **no requiere alojar la página en Azure**.

1. Pedí a TI un registro de aplicación de un solo tenant autorizado para leer únicamente tu buzón mediante Graph. Esta versión usa autenticación de aplicación con identificador y secreto.
2. TI debe limitar y verificar el alcance del buzón mediante Exchange Online Application RBAC o una política de acceso compatible. No autorizar lectura irrestricta de todos los buzones. No utiliza permisos de envío ni escritura.
3. Copiá `.env.example` como `.env` y completá `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` y `MS_MAILBOX` con la configuración aprobada. No subas ese archivo a GitHub ni compartas sus valores por chat. El secreto queda en tu computadora; protegelo con los permisos de tu cuenta. TI debe aprobar su uso local y rotarlo antes de su vencimiento.
4. Reiniciá el tablero. Consulta automáticamente y mediante **Actualizar ahora**. Una consulta fallida no adelanta el último corte de revisión.

Todavía no implementa inicio de sesión delegado de usuario. Si TI no permite secretos de aplicación en el equipo, habrá que adaptar la autenticación antes de conectar el correo; el tablero puede seguir siendo local.

Necesita Internet para consultar `login.microsoftonline.com` y `graph.microsoft.com`. Usa el proxy heredado y mantiene la verificación TLS. Las credenciales no se entregan al navegador.

## Funcionamiento

- Vistas de tablero/lista, búsqueda, prioridad, responsable, notas y borradores editables. La prioridad se elige manualmente: gerencia, equipo interno, contratistas.
- Solo consulta **Bandeja de entrada** del buzón configurado. Primera consulta: últimos 30 días; luego desde el último éxito con cinco minutos de solapamiento. No lee enviados, adjuntos, subcarpetas ni mensajes movidos fuera de la bandeja antes de la consulta.
- Consulta Outlook cada cinco minutos (configurable); el navegador consulta los cambios locales cada 15 segundos. También hay un botón de actualización. Es consulta periódica, no webhooks en tiempo real.
- **Solo se actualiza con la computadora encendida, activa, conectada y la ventana del servidor abierta.** Al suspender/apagar el equipo o cerrar la ventana se detiene. Al reiniciar recupera desde el último corte exitoso, dentro de su alcance de Bandeja de entrada.
- Agrupa por conversación y conserva el mensaje entrante más reciente. Los nuevos casos ingresan como **Por confirmar / Sin clasificar**. Una nueva entrada marca la conversación para revisar, conservando estados, responsables, notas y borradores anteriores.
- No cierra tareas por una respuesta ni elimina pendientes antiguos. No envía borradores. **No incluye clasificación ni generación de respuestas mediante IA**.
- Hasta 100 páginas de 100 mensajes por consulta. Un fallo no guarda resultados parciales ni adelanta el corte. Ante 429 reintenta en el ciclo siguiente; si supera el límite habrá que ajustar la sincronización.

Para migrar el seguimiento anterior hacen falta los JSON/Excel originales y un importador adaptado a su estructura: el PDF no contiene esos archivos. Después no se requieren cargas manuales de JSON para sincronizar.

## Datos, acceso y respaldo

Las tareas se guardan en **`data/hys.sqlite`**, con los archivos auxiliares de SQLite, en la carpeta de la aplicación. Sobreviven al cierre y reinicio. No se suben a GitHub ni a un servidor de hosting. Eliminar un correo en Outlook no lo borra del tablero.

Para respaldar, cerrá el tablero y copiá la carpeta `data` completa a una ubicación protegida. Para restaurar, con el tablero detenido reemplazá esa carpeta por el respaldo. **Al actualizar el código conservá `.env` y `data`; no los borres ni sobrescribas al extraer una nueva versión.**

El servidor rechaza configuraciones para escuchar fuera de la interfaz local, incluso si se configura una clave. No acepta identidades de Azure como autenticación. No configures túneles, reenvíos o proxies para compartirlo. Otras aplicaciones de tu sesión pueden acceder al puerto; opcionalmente usá `DASHBOARD_TOKEN` para exigir una clave adicional.

`.env` y `data` están excluidos de Git. No subas bases de datos ni correspondencia al repositorio.

## Variables

| Variable | Uso |
| --- | --- |
| `HOST` | Solo `127.0.0.1` (predeterminado), `localhost` o `::1` |
| `PORT` | Por defecto `3000` |
| `DATA_DIR` | Carpeta persistente; por defecto `./data` |
| `SYNC_INTERVAL_MINUTES` | Frecuencia de Outlook; por defecto 5, mínimo 1 |
| `MS_TENANT_ID`, `MS_CLIENT_ID` | Identificadores aprobados por TI |
| `MS_CLIENT_SECRET` | Secreto local para lectura autorizada del correo |
| `MS_MAILBOX` | Buzón autorizado |
| `DASHBOARD_TOKEN` | Clave adicional opcional para el tablero local |

Las antiguas `AUTH_MODE`, `ALLOWED_USER_EMAILS` y `PUBLIC_ORIGIN` de Azure ya no se utilizan y se pueden quitar de un `.env` previo.

## Desarrollo y validación

Desde la carpeta del proyecto, `npm start` inicia el servidor, `npm run desktop` también abre el navegador y `npm test` ejecuta las pruebas. Usá solo un servidor a la vez. En Windows podés usar `npm.cmd` desde Símbolo del sistema si la política restringe scripts de PowerShell.

En tareas de desarrollo en la nube usá el checkout existente `/workspace/Test1`; cada tarea ya está aislada, no crees worktrees salvo pedido explícito. Esto no implica desplegar el tablero en la nube.

Las pruebas usan Graph simulado y bases temporales, sin leer correo real. La conexión a Outlook solo está verificada tras una consulta real exitosa. La validación en Linux no reemplaza una prueba del lanzador `.cmd` en tu Windows.
