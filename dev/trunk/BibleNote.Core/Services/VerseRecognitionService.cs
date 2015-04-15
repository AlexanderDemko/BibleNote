using BibleNote.Core.Common;
using BibleNote.Core.Constants;
using BibleNote.Core.Contracts;
using BibleNote.Core.Helpers;
using BibleNote.Core.Services.System;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Services
{
    public class VerseRecognitionService : IVerseRecognitionService
    {
        private char[] _chapterVerseDelimiter;
        private char[] _startVerseChars;
        private readonly object _locker = new object();

        [Dependency]
        public IVersePointerFactory VersePointerFactory { get; set; }

        [Dependency]
        public IConfigurationManager ConfigurationManager { get; set; }        

        public VerseEntryInfo TryGetVerse(string text, int index)
        {
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

        private bool EntryIsLikeVerse(string text, int indexOfDigit)
        {
            var prevChar = StringUtils.GetChar(text, indexOfDigit - 1);
            var nextChar = StringUtils.GetCharAfterNumber(text, indexOfDigit);

            return (GetStartVerseChars().Contains(prevChar) || char.IsLetter(prevChar))
                 && !char.IsLetter(nextChar);
        }


        //todo: перенести в singleton class
        private char[] GetChapterVerseDelimiters()
        {
            if (_chapterVerseDelimiter == null)
            {
                lock (_locker)
                {
                    if (_chapterVerseDelimiter == null)
                    {
                        var chars = new List<char>() { VerseConstants.DefaultChapterVerseDelimiter };
                        if (ConfigurationManager.UseCommaDelimiter)
                            chars.Add(',');

                        _chapterVerseDelimiter = chars.ToArray();
                    }
                }
            }

            return _chapterVerseDelimiter;
        }


        private char[] GetStartVerseChars()
        {
            if (_startVerseChars == null)
            {
                lock (_locker)
                {
                    if (_startVerseChars == null)
                    {
                        _startVerseChars = new List<char>(GetChapterVerseDelimiters()) { ',', ';', ' ', '.' }.Distinct().ToArray();
                    }
                }
            }

            return _startVerseChars;
        }
    }
}
