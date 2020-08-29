const { Gio } = imports.gi;

var paths = {};

function getSettings(moduleName)
{
    let modulePath = paths[moduleName];

    if(!modulePath)
        return null;

    let GioSSS = Gio.SettingsSchemaSource;
    let gschemas = Gio.File.new_for_path(
        `${modulePath}/schemas/gschemas.compiled`
    );

    if(!gschemas.query_exists(null))
        return null;

    let schemaSource = GioSSS.new_from_directory(
        `${modulePath}/schemas`,
        GioSSS.get_default(),
        false
    );

    let schemaList = schemaSource.list_schemas(false);
    let schemaObj = schemaSource.lookup(String(schemaList[0]), true);

    return (schemaObj)
        ? new Gio.Settings({ settings_schema: schemaObj })
        : null;
}
