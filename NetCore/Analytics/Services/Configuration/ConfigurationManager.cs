using BibleNote.Analytics.Services.Configuration.Contracts;
using System;

namespace BibleNote.Analytics.Services.Configuration
{
    class ConfigurationManager : IConfigurationManager
    {   
        public string ModuleShortName { get; set; }
        public bool UseCommaDelimiter { get; set; }        

        public ConfigurationManager()
        {            
            throw new NotImplementedException();
        }

        public void SaveChanges()
        {
            //throw new NotImplementedException();
        }
    }
}
