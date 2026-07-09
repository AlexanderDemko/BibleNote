using BibleNote.Services.Configuration.Contracts;

namespace BibleNote.Console
{
    public class MockConfigurationManager : IConfigurationManager
    {
        public string ModuleShortName { get; set; }

        public bool UseCommaDelimiter { get; set; }

        public int Language { get; set; }

        public MockConfigurationManager()
        {
            ModuleShortName = "rst";
            UseCommaDelimiter = true;
        }

        public void SaveChanges()
        {
           
        }

        public System.IDisposable UseTemporarySettings(string moduleShortName, bool? useCommaDelimiter = null)
        {
            var previousModuleShortName = ModuleShortName;
            var previousUseCommaDelimiter = UseCommaDelimiter;
            ModuleShortName = string.IsNullOrWhiteSpace(moduleShortName) ? ModuleShortName : moduleShortName;
            UseCommaDelimiter = useCommaDelimiter ?? UseCommaDelimiter;

            return new TemporarySettingsScope(() =>
            {
                ModuleShortName = previousModuleShortName;
                UseCommaDelimiter = previousUseCommaDelimiter;
            });
        }

        private sealed class TemporarySettingsScope : System.IDisposable
        {
            private readonly System.Action restore;
            private bool disposed;

            public TemporarySettingsScope(System.Action restore)
            {
                this.restore = restore;
            }

            public void Dispose()
            {
                if (disposed)
                    return;

                restore();
                disposed = true;
            }
        }
    }
}
