using BibleNote.Core.Contracts;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Services.System
{
    public class Logger : ILogger
    {
        public void LogMessage(string message, params object[] args)
        {
            Console.WriteLine(message, args);
        }

        public void LogWarning(string message, params object[] args)
        {
            Console.WriteLine(message, args);
        }

        public void LogException(string message, params object[] args)
        {
            Console.WriteLine(message, args);
        }

        public void LogException(Exception ex)
        {
            Console.WriteLine(ex.ToString());
        }
    }
}
