using BibleNote.Analytics.Contracts;
using BibleNote.Analytics.Core.Constants;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Models.Common;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services
{
    public class VerseRecognitionService : IVerseRecognitionService
    {
        [Dependency]
        public IVersePointerFactory VersePointerFactory { get; set; }

        [Dependency]
        public IConfigurationManager ConfigurationManager { get; set; }

        [Dependency]
        public IModulesManager ModulesManager { get; set; }

        [Dependency]
        public IApplicationManager ApplicationManager { get; set; }
        
        public VerseEntryInfo VerseEntryInfo { get; set; }        

        public VerseEntryInfo TryGetVerse(string text, int index)
        {
            VerseEntryInfo = new VerseEntryInfo();

            var indexOfDigit = StringUtils.GetNextIndexOfDigit(text, index);            
            while (indexOfDigit != -1)
            {
                if (EntryIsLikeVerse(text, indexOfDigit))
                {
                    var versePointerPotentialString = GetVersePointerPotentialString(text, indexOfDigit);                

                }
            }

            throw new NotImplementedException();
        }

        private string GetVersePointerPotentialString(string text, int indexOfDigit)
        {
            throw new NotImplementedException();
        }

        //todo: доделать (рефакторинг + возвращать модуль)
        private string GetBookName(string text, bool endsWithDot)
        {
            var index = -1;
            string moduleName;

            do
            {
                var bibleBookInfo = ApplicationManager.CurrentModuleInfo.GetBibleBook(text, endsWithDot, out moduleName);
                if (bibleBookInfo != null)
                    return bibleBookInfo.Name;
                else
                {
                    index = text.IndexOfAny(new char[] { ' ', ',', '.', ':', '-', '/', '\\', '>', '<', '=' });
                    if (index != -1)
                        text = text.Substring(index + 1);
                }

            } while (index > -1);

            return null;
        }

        private bool EntryIsLikeVerse(string text, int indexOfDigit)
        {
            var prevChar = StringUtils.GetChar(text, indexOfDigit - 1);
            int endOfVerseEntry;
            var nextChar = StringUtils.GetCharAfterNumber(text, indexOfDigit, out endOfVerseEntry);

            var result = (VerseUtils.GetStartVerseChars(ConfigurationManager.UseCommaDelimiter).Contains(prevChar) || char.IsLetter(prevChar))
                 && (nextChar == default(char) || !(char.IsLetter(nextChar) || char.IsDigit(nextChar)));

            if (result)
            {
                VerseEntryInfo.EndIndex = endOfVerseEntry;
                VerseEntryInfo.EndOfTextDetected = nextChar == default(char);
            }

            return result;
        }
    }
}
