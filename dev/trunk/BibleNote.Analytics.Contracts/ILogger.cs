using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts
{
    public interface ILogger
    {        
        void LogMessage(string message, params object[] args);
        void LogWarning(string message, params object[] args);
        void LogException(string message, params object[] args);

        void LogException(Exception ex);
    }
}
