using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Core.Extensions
{
    public static class DictionaryExtensions
    {
        public static V Get<K, V>(this Dictionary<K, V> dict, K key) where V: class
        {
            V value;
            if (dict.TryGetValue(key, out value))
                return value;

            return null;
        }
    }
}
