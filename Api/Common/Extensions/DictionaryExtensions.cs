using System.Collections.Generic;

namespace BibleNote.Common.Extensions
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
