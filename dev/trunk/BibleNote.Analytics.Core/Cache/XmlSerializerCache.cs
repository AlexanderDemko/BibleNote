using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Serialization;

namespace BibleNote.Analytics.Core.Cache
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
            if (!_cacheItems.ContainsKey(type))
            {
                lock (_locker)
                {
                    if (!_cacheItems.ContainsKey(type))
                        _cacheItems.Add(type, new XmlSerializer(type));
                }
            }

            return _cacheItems[type];
        }
    }
}
