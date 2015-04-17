using BibleNote.Analytics.Contracts;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services
{
    public class ConfigurationManager : IConfigurationManager
    {   
        public string ModuleShortName { get; set; }
        public bool UseCommaDelimiter { get; set; }
        

        public ConfigurationManager(bool loadTestData)
        {
            if (loadTestData)
            {   
                ModuleShortName = "rst";
                UseCommaDelimiter = true;
            }
            else
                throw new NotImplementedException();
        }


        public void SaveChanges()
        {
            //throw new NotImplementedException();
        }
    }
}
