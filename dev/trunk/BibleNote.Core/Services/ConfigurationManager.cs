using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Services
{
    public class ConfigurationManager
    {
        private static readonly object _locker = new object();

        private static volatile ConfigurationManager _instance = null;
        public static ConfigurationManager Instance
        {
            get
            {
                if (_instance == null)
                {
                    lock (_locker)
                    {
                        if (_instance == null)
                        {
                            _instance = new ConfigurationManager();
                        }
                    }
                }

                return _instance;
            }
        }

        public string DBIndexPath { get; set; }
        public string ModuleShortName { get; set; }
        

        protected ConfigurationManager()
        {
            // test data
            DBIndexPath = @"C:\prj\BibleNote v4\dev\trunk\Data\BibleNote.Index.sdf";
            ModuleShortName = "rst";
        }        
    }
}
