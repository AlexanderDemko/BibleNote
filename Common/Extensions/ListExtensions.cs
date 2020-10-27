using System.Collections.Generic;

namespace BibleNote.Common.Extensions
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
