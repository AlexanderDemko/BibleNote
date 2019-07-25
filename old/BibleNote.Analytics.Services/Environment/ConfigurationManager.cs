using BibleNote.Analytics.Contracts.Environment;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.Environment
{
    public class ConfigurationManager : IConfigurationManager
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
