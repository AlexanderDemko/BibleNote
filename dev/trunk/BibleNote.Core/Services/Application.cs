using BibleNote.Core.Contracts;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Services
{
    public static class Application
    {
        static Application()
        {
            Logger = new Logger();
            ConfigurationManager = new ConfigurationManager(true);
            ModulesManager = new ModulesManager();
        }

        public static ICustomLogger Logger { get; private set; }
        public static ConfigurationManager ConfigurationManager { get; private set; }
        public static ModulesManager ModulesManager { get; private set;}
    }
}
