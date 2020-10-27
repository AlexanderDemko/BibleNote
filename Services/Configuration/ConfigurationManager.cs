using System;
using BibleNote.Services.Configuration.Contracts;

namespace BibleNote.Services.Configuration
{
    class ConfigurationManager : IConfigurationManager
    {   
        public string ModuleShortName { get; set; }
        public bool UseCommaDelimiter { get; set; }        

        public ConfigurationManager()
        {            
            throw new NotImplementedException(); // todo
        }

        public void SaveChanges()
        {
            throw new NotImplementedException(); // todo
        }
    }
}
