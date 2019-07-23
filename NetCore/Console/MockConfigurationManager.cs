using BibleNote.Analytics.Services.Configuration.Contracts;
using System;
using System.Collections.Generic;
using System.Text;

namespace BibleNoteConsole
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
