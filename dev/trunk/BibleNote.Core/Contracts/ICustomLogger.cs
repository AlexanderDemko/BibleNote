using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Contracts
{
    public interface ICustomLogger
    {        
        void LogMessage(string message, params object[] args);
        void LogWarning(string message, params object[] args);
        void LogException(string message, params object[] args);

        void LogException(Exception ex);
    }
}
