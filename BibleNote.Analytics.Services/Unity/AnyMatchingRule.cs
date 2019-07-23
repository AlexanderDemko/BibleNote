using Microsoft.Practices.Unity.InterceptionExtension;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.Unity
{
    public class AnyMatchingRule : IMatchingRule
    {
        public bool Matches(MethodBase member)
        {
            return true;
        }
    }
}
