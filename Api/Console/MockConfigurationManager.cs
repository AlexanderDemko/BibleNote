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
    }
}
