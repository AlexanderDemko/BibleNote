using Microsoft.Practices.Unity.InterceptionExtension;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.Logging
{
    public interface ITracer
    {
        void TraceMethodIn(string className, string methodName, IParameterCollection arguments);
        void TraceMethodReturn(string className, string methodName, object returnValue, IParameterCollection outputs);
        void TraceMethodExpection(string className, string methodName, Exception exception);
        void TraceMethodIn(string className, string actionName, IDictionary<string, object> actionParameters);
    }
}
