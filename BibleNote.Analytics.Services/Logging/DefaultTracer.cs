using BibleNote.Analytics.Contracts.Logging;
using Microsoft.Practices.Unity.InterceptionExtension;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.Logging
{
    [DebuggerStepThrough]
    public class DefaultTracer : ITracer
    {
        private readonly ILog _logger;

        public DefaultTracer(ILog logger)
        {
            _logger = logger;
        }

        public void TraceMethodIn(string className, string methodName, IParameterCollection arguments)
        {
            if (!_logger.IsLogLevelEnabled(LogLevel.Debug)) return;

            var preMethodMessage = String.Format("{0}.{1}({2})", className, methodName, FormatArguments(arguments));
            _logger.Write(LogLevel.Debug, preMethodMessage);
        }

        public void TraceMethodIn(string className, string actionName, IDictionary<string, object> actionParameters)
        {
            if (!_logger.IsLogLevelEnabled(LogLevel.Debug)) return;

            var preMethodMessage = String.Format("{0}.{1}({2})", className, actionName, FormatArguments(actionParameters));
            _logger.Write(LogLevel.Debug, preMethodMessage);
        }

        public void TraceMethodReturn(string className, string methodName, object returnValue, IParameterCollection outputs)
        {
            if (!_logger.IsLogLevelEnabled(LogLevel.Debug)) return;

            var postMethodMessage = String.Format("{0}.{1}() -> {2}", className, methodName, returnValue);
            _logger.Write(LogLevel.Debug, postMethodMessage);
        }

        public void TraceMethodExpection(string className, string methodName, Exception exception)
        {
            if (!_logger.IsLogLevelEnabled(LogLevel.Debug)) return;

            var exceptionMessage = String.Format("{0}.{1} throws {2}", className, methodName, exception);
            _logger.Write(LogLevel.Error, exceptionMessage);
        }

        private static string FormatArguments(IParameterCollection arguments)
        {
            if (arguments == null || arguments.Count == 0)
                return String.Empty;

            var sb = new StringBuilder();
            for (var i = 0; i < arguments.Count; i++)
                sb.AppendFormat("{0}: {1},", arguments.ParameterName(i), arguments[i]);

            if (sb.Length != 0)
                sb.Length--;
            return sb.ToString();
        }

        private object FormatArguments(IDictionary<string, object> actionParameters)
        {
            if (actionParameters == null || actionParameters.Count == 0)
                return String.Empty;
            return String.Join(",", actionParameters.Select(kv => String.Format("{0}: {1}", kv.Key, kv.Value)));
        }
    }
}
