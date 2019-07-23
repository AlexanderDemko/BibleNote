using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.Logging
{
    public enum LogLevel
    {
        Error = 1,
        Warning = 2,
        Info = 3,
        Debug = 4,
        None = 5
    }

    public interface ILog : IDisposable
    {
        void Write(LogLevel level, string message);
        bool IsLogLevelEnabled(LogLevel level);
    }
}
