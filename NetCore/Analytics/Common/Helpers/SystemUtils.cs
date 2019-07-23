using BibleNote.Analytics.Common.Constants;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Common.Helpers
{
    public static class SystemUtils
    {
        public static Version GetProgramVersion()
        {
            var assembly = Assembly.GetExecutingAssembly();
            return assembly.GetName().Version;
        }

        public static string GetProgramDirectory()
        {
            string directoryPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), SystemConstants.ToolsName);

            if (!Directory.Exists(directoryPath))
                Directory.CreateDirectory(directoryPath);

            return directoryPath;
        }

        public static string GetCurrentDirectory()
        {
            var assembly = Assembly.GetExecutingAssembly().CodeBase;
            var uri = new Uri(assembly);
            return Path.GetDirectoryName(uri.LocalPath);
        }

        public static string GetTempFolderPath()
        {
            string s = Path.Combine(GetProgramDirectory(), SystemConstants.TempDirectoryName);
            if (!Directory.Exists(s))
                Directory.CreateDirectory(s);

            return s;
        }

        public static string GetCacheFolderPath()
        {
            string s = Path.Combine(GetProgramDirectory(), SystemConstants.CacheDirectoryName);
            if (!Directory.Exists(s))
                Directory.CreateDirectory(s);

            return s;
        }
    }
}
