using System;
using System.Collections.Generic;
using System.Xml.Serialization;

namespace BibleNote.Common.Cache
{
    public static class XmlSerializerCache
    {
        private static volatile Dictionary<Type, XmlSerializer> _cacheItems = new Dictionary<Type, XmlSerializer>();
        private static readonly object _locker = new object();

        public static Dictionary<Type, XmlSerializer> CacheItems
        {
            get
            {
                return _cacheItems;
            }
        }

        public static XmlSerializer GetXmlSerializer(Type type)
        {
            XmlSerializer result;
            if (!_cacheItems.TryGetValue(type, out result))
            {
                lock (_locker)
                {
                    if (!_cacheItems.TryGetValue(type, out result))
                    {
                        result = new XmlSerializer(type);
                        _cacheItems.Add(type, result);
                    }
                }
            }

            return result;
        }
    }
}
