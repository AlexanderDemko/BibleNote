using BibleNote.Analytics.Contracts.Environment;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

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
