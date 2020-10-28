using System;
using System.Globalization;

namespace BibleNote.Providers.OneNote.Utils
{
    static class StringUtils
    {
        public static DateTime ParseDateTime(string s)
        {
            try
            {
                return DateTime.Parse(s, CultureInfo.InvariantCulture);
            }
            catch (FormatException)
            {
                try
                {
                    return DateTime.Parse(s);
                }
                catch (FormatException)
                {
                    throw new NotImplementedException();        // todo
                    //return DateTime.Parse(s, LanguageManager.GetCurrentCultureInfo()); 
                }
            }
        }
    }
}
