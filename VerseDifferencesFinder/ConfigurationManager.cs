using BibleNote.Services.Configuration.Contracts;

namespace BibleNote.VerseDifferencesFinder
{
    public class ConfigurationManager : IConfigurationManager
    {
        public string ModuleShortName { get; set; }

        public bool UseCommaDelimiter { get; set; }

        public ConfigurationManager(string moduleShortName)
        {
            ModuleShortName = moduleShortName;
            UseCommaDelimiter = true;
        }

        public void SaveChanges()
        {
        }
    }
}
