using System;
using System.IO;
using System.Text.Json;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.ModulesManager;

namespace BibleNote.Services.Configuration
{
    class ConfigurationManager : IConfigurationManager
    {
        private readonly string settingsPath;

        public string ModuleShortName { get; set; } = "rst";

        public bool UseCommaDelimiter { get; set; } = true;

        public int Language { get; set; }

        public ConfigurationManager()
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            settingsPath = Path.Combine(appData, SystemConstants.ToolsName, "settings.json");
            Load();
        }

        public void SaveChanges()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(settingsPath));
            var settings = new Settings
            {
                ModuleShortName = ModuleShortName,
                UseCommaDelimiter = UseCommaDelimiter,
                Language = Language
            };
            File.WriteAllText(settingsPath, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
        }

        private void Load()
        {
            if (!File.Exists(settingsPath)) return;

            try
            {
                var settings = JsonSerializer.Deserialize<Settings>(File.ReadAllText(settingsPath));
                if (!string.IsNullOrWhiteSpace(settings?.ModuleShortName))
                    ModuleShortName = settings.ModuleShortName;
                UseCommaDelimiter = settings?.UseCommaDelimiter ?? UseCommaDelimiter;
                Language = settings?.Language ?? Language;
            }
            catch
            {
                // Keep defaults if the local settings file is missing fields or cannot be parsed.
            }
        }

        private sealed class Settings
        {
            public string ModuleShortName { get; set; }

            public bool UseCommaDelimiter { get; set; }

            public int Language { get; set; }
        }
    }
}
