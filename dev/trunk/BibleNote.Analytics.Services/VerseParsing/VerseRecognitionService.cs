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

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class BookEntry
    {
        public string BookName { get; set; }
        public string ModuleName { get; set; }
    }

    /// <summary>
    /// Класс оперирует только обычной строкой. Ничего не знает об html. Ищет стих только в пределах переданной строки. Ему не важно, нашёл он книгу, главу или только стих.
    /// </summary>
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
        
        public VerseEntryInfo TryGetVerse(string text, int startIndex)
        {
            VerseEntryInfo result = null;

            var indexOfDigit = StringUtils.GetNextIndexOfDigit(text, startIndex);
            while (indexOfDigit != -1)
            {
                if (EntryIsLikeVerse(text, indexOfDigit))
                {
                    var actualStringStartIndex = indexOfDigit - ApplicationManager.CurrentModuleInfo.MaxBookNameLength - 2;
                    if (actualStringStartIndex < startIndex) 
                        actualStringStartIndex = startIndex;


                    // todo: немного не понятно, нужно ли здесь вызвать другой сервис (тот же VersePointerFactory). Или просто текущий класс не делать в таком процедурном стиле.
                    result = TryGetVerseEntry(text, actualStringStartIndex, indexOfDigit);                    
                }

                if (result != null && result.VersePointerFound)
                    break;
                else
                    indexOfDigit = StringUtils.GetNextIndexOfDigit(text, indexOfDigit + 1);
            }

            return result;
        }

        private VerseEntryInfo TryGetVerseEntry(string text, int startIndex, int indexOfDigit)
        {
            var result = new VerseEntryInfo();
            //var bookName = GetBookName(text.Substring(startIndex, indexOfDigit - startIndex), );

            return result;
        }

        private BookEntry GetBookName(string text, bool endsWithDot)
        {
            var index = -1;            
            string moduleName;

            do
            {
                var bibleBookInfo = ApplicationManager.CurrentModuleInfo.GetBibleBook(text, endsWithDot, out moduleName);
                if (bibleBookInfo != null)
                    return new BookEntry() { BookName = bibleBookInfo.Name, ModuleName = moduleName };
                else
                {
                    index = text.IndexOfAny(VerseUtils.GetWordDelimiters());
                    if (index != -1)
                        text = text.Substring(index + 1);
                }

            } while (index > -1);

            return null;
        }

        private bool EntryIsLikeVerse(string text, int indexOfDigit)
        {
            var prevChar = StringUtils.GetChar(text, indexOfDigit - 1);
            int indexOfChar;
            var nextChar = StringUtils.GetCharAfterNumber(text, indexOfDigit, out indexOfChar);

            var result = (VerseUtils.GetStartVerseChars(ConfigurationManager.UseCommaDelimiter).Contains(prevChar) || char.IsLetter(prevChar))
                 && (nextChar == default(char) || !(char.IsLetter(nextChar) || char.IsDigit(nextChar)));

            return result;
        }
    }
}
