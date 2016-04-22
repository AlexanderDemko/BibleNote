using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Models.Common;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class VersePointerFactory : IVersePointerFactory
    {
        private readonly IStringParser _stringParser;
        private readonly IApplicationManager _applicationManager;

        public VersePointerFactory(IStringParser stringParser, IApplicationManager applicationManager)
        {
            _stringParser = stringParser;
            _applicationManager = applicationManager;
        }

        public VersePointer CreateVersePointer(string text)
        {
            var verseEntry = _stringParser.TryGetVerse(text, 0);
            if (verseEntry.VersePointerFound
                && (verseEntry.EntryType == VerseEntryType.BookChapter || verseEntry.EntryType == VerseEntryType.BookChapterVerse)
                && verseEntry.StartIndex == 0
                //&& verseEntry.EndIndex == text.Length - 1
                )
            {
                return verseEntry.VersePointer;
            }

            return null;
        }

        public VersesListInfo<VersePointer> ExpandMultiVerse(VersePointer versePointer)
        {   
            var result = new VersesListInfo<VersePointer>();
            if (versePointer.IsMultiVerse == MultiVerse.None)
                return result;

            var bookContent = _applicationManager.CurrentBibleContent.BooksDictionary[versePointer.BookIndex];            
            for (var chapterIndex = versePointer.Chapter; chapterIndex <= versePointer.MostTopChapter; chapterIndex++)
            {
                if (bookContent.Chapters.Count < chapterIndex)
                {
                    result.NotFoundVersePointers.Add(new VersePointer(versePointer.Book, versePointer.ModuleName, null, new VerseNumber(chapterIndex)));
                    break;
                }                    

                var chapterContent = bookContent.Chapters[chapterIndex - 1];
                if ((versePointer.Chapter < chapterIndex 
                            || (versePointer.VerseNumber.IsChapter && versePointer.Chapter == chapterIndex))
                    && (chapterIndex < versePointer.MostTopChapter 
                            || (versePointer.TopVerseNumber.Value.IsChapter && versePointer.MostTopChapter == chapterIndex)))
                {
                    result.VersePointers.Add(new VersePointer(versePointer.Book, versePointer.ModuleName, null, new VerseNumber(chapterIndex)));
                    result.VersesCount += versePointer.IsChapter ? 1 : chapterContent.Verses.Count;
                }
                else
                {
                    var startVerse = chapterIndex == versePointer.Chapter ? versePointer.Verse : 1;
                    var endVerse = chapterIndex == versePointer.MostTopChapter ? versePointer.MostTopVerse : chapterContent.Verses.Count;

                    for (var verseIndex = startVerse; verseIndex <= endVerse; verseIndex++)
                    {
                        var verse = new VersePointer(versePointer.Book, versePointer.ModuleName, null, new VerseNumber(chapterIndex, verseIndex));
                        if (chapterContent.Verses.Count < verseIndex)
                        {
                            result.NotFoundVersePointers.Add(verse);
                            break;
                        }                        
                        
                        result.VersePointers.Add(verse);
                        result.VersesCount++;                        
                    }
                }
            }

            return result;        
        }
    }
}
