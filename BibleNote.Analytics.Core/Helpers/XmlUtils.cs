using BibleNote.Analytics.Core.Cache;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Core.Helpers
{
    public static class XmlUtils
    {
        public static void SaveToXmlFile(object data, string filePath)
        {
            var serializer = XmlSerializerCache.GetXmlSerializer(data.GetType());
            using (var fs = new FileStream(filePath, FileMode.Create))
            {
                serializer.Serialize(fs, data);
                fs.Flush();
            }
        }

        public static T LoadFromXmlFile<T>(string filePath)
        {
            using (var ms = new MemoryStream(File.ReadAllBytes(filePath)))
            {
                return ((T)XmlSerializerCache.GetXmlSerializer(typeof(T)).Deserialize(ms));
            }
        }

        public static T LoadFromXmlString<T>(string value)
        {
            var serializer = XmlSerializerCache.GetXmlSerializer(typeof(T));
            using (var ms = new MemoryStream())
            {
                using (var sw = new StreamWriter(ms))
                {
                    sw.WriteLine(value);
                    sw.Flush();
                    ms.Position = 0;

                    return (T)serializer.Deserialize(ms);
                }
            }
        }
    }
}
