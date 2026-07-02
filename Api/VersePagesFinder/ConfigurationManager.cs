using BibleNote.Services.Configuration.Contracts;

namespace BibleNote.VersePagesFinder
{
    public class ConfigurationManager : IConfigurationManager
    {
        public string ModuleShortName { get; set; }

        public bool UseCommaDelimiter { get; set; }

        public int Language { get; set; }

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
