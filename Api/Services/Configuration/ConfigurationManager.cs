using System;
using System.IO;
using System.Text.Json;
using System.Threading;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.ModulesManager;

namespace BibleNote.Services.Configuration
{
    class ConfigurationManager : IConfigurationManager
    {
        private readonly string settingsPath;
        private readonly AsyncLocal<TemporarySettings> temporarySettings = new AsyncLocal<TemporarySettings>();
        private string moduleShortName = "rst";
        private bool useCommaDelimiter = true;

        public string ModuleShortName
        {
            get => temporarySettings.Value?.ModuleShortName ?? moduleShortName;
            set => moduleShortName = value;
        }

        public bool UseCommaDelimiter
        {
            get => temporarySettings.Value?.UseCommaDelimiter ?? useCommaDelimiter;
            set => useCommaDelimiter = value;
        }

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
                ModuleShortName = moduleShortName,
                UseCommaDelimiter = useCommaDelimiter,
                Language = Language
            };
            File.WriteAllText(settingsPath, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
        }

        public IDisposable UseTemporarySettings(string moduleShortName, bool? useCommaDelimiter = null)
        {
            var previous = temporarySettings.Value;
            temporarySettings.Value = new TemporarySettings
            {
                ModuleShortName = string.IsNullOrWhiteSpace(moduleShortName) ? ModuleShortName : moduleShortName,
                UseCommaDelimiter = useCommaDelimiter ?? UseCommaDelimiter
            };
            return new TemporarySettingsScope(this, previous);
        }

        private void Load()
        {
            if (!File.Exists(settingsPath)) return;

            try
            {
                var settings = JsonSerializer.Deserialize<Settings>(File.ReadAllText(settingsPath));
                if (!string.IsNullOrWhiteSpace(settings?.ModuleShortName))
                    moduleShortName = settings.ModuleShortName;
                useCommaDelimiter = settings?.UseCommaDelimiter ?? useCommaDelimiter;
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

        private sealed class TemporarySettings
        {
            public string ModuleShortName { get; set; }

            public bool UseCommaDelimiter { get; set; }
        }

        private sealed class TemporarySettingsScope : IDisposable
        {
            private readonly ConfigurationManager configurationManager;
            private readonly TemporarySettings previous;
            private bool disposed;

            public TemporarySettingsScope(ConfigurationManager configurationManager, TemporarySettings previous)
            {
                this.configurationManager = configurationManager;
                this.previous = previous;
            }

            public void Dispose()
            {
                if (disposed)
                    return;

                configurationManager.temporarySettings.Value = previous;
                disposed = true;
            }
        }
    }
}
