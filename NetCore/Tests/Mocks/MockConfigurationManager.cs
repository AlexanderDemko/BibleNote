using BibleNote.Analytics.Services.Configuration.Contracts;

namespace BibleNote.Tests.Analytics.Mocks
{
    public class MockConfigurationManager : IConfigurationManager
    {
        public string ModuleShortName { get; set; }

        public bool UseCommaDelimiter { get; set; }

        public MockConfigurationManager()
        {           
            ModuleShortName = "rst";
            UseCommaDelimiter = true;          
        }

        public void SaveChanges()
        {
            //throw new NotImplementedException();
        }
    }
}
