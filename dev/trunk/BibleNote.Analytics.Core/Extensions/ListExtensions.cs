using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Core.Extensions
{
    public static class ListExtensions
    {
        public static T TryGetAt<T>(this List<T> list, int index)
        {            
            if (list.Count > index && index >= 0)
                return list[index];

            return default(T);
        }
    }
}
