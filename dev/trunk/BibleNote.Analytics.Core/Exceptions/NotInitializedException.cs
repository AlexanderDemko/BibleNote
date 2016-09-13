using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Core.Exceptions
{
    public class NotInitializedException: Exception
    {        
        public NotInitializedException(string message)
            : base (message)
        {

        }
    }
}
