using BibleNote.Analytics.Contracts.Logging;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.Logging
{
    [DebuggerStepThrough]
    public class DiagnosticsLog : ILog
    {
        private readonly TraceSource _traceSource;

        public DiagnosticsLog(string source)
        {
            _traceSource = new TraceSource(source);
        }

        public void Write(LogLevel level, string message)
        {
            _traceSource.TraceEvent(ConvertLogLevel(level), 0, message);
        }

        public bool IsLogLevelEnabled(LogLevel level)
        {
            switch (level)
            {
                case LogLevel.Debug:
                    return (_traceSource.Switch.Level & SourceLevels.Verbose) != 0;
                case LogLevel.Info:
                    return (_traceSource.Switch.Level & SourceLevels.Information) != 0;
                case LogLevel.Warning:
                    return (_traceSource.Switch.Level & SourceLevels.Warning) != 0;
                case LogLevel.Error:
                    return (_traceSource.Switch.Level & SourceLevels.Error) != 0;
                default:
                    return (_traceSource.Switch.Level & SourceLevels.Warning) != 0;
            }
        }

        public void Dispose()
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }

        private void Dispose(bool disposing)
        {
            if (disposing)
            {
                if (_traceSource != null)
                    _traceSource.Close();
            }
        }

        private static TraceEventType ConvertLogLevel(LogLevel level)
        {
            switch (level)
            {
                case LogLevel.Debug:
                    return TraceEventType.Verbose;
                case LogLevel.Info:
                    return TraceEventType.Information;
                case LogLevel.Warning:
                    return TraceEventType.Warning;
                case LogLevel.Error:
                    return TraceEventType.Error;
                default:
                    return TraceEventType.Warning;
            }
        }
    }
}
