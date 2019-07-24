using BibleNote.Analytics.Contracts.Logging;
using Microsoft.Practices.Unity.InterceptionExtension;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.Unity
{
    public class LogCallHandler : ICallHandler
    {
        private readonly ITracer _tracer;

        public LogCallHandler(ITracer tracer)
        {
            _tracer = tracer;
        }

        [DebuggerStepThrough]
        public IMethodReturn Invoke(IMethodInvocation input, GetNextHandlerDelegate getNext)
        {
            var type = input.MethodBase.DeclaringType ?? input.MethodBase.ReflectedType;
            var className = type.Name;
            var methodName = input.MethodBase.Name;
            _tracer.TraceMethodIn(className, methodName, input.Arguments);

            var msg = getNext()(input, getNext);

            if (msg.Exception != null)
            {
                _tracer.TraceMethodExpection(className, methodName, msg.Exception);
            }
            _tracer.TraceMethodReturn(className, methodName, msg.ReturnValue, msg.Outputs);

            return msg;
        }

        public int Order { get; set; }
    }
}
