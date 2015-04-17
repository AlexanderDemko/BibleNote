using BibleNote.Analytics.Contracts;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Services.System;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNoteConsole
{
    public class CheckVerseRecognitionVariantsPerfomance
    {
        public class BookAbbreviation
        {
            public Abbreviation Abbreviation { get; set; }
            public int AbbreviationLength { get; set; }
            public BibleBookInfo BookInfo { get; set; }
        }

        public const int TimesCount = 1000;

        public IModulesManager ModulesManager { get; set; }

        private ModuleInfo _moduleInfo;        
        private string _inputText;
        private string _variant1Result;
        private string _variant2Result;
        private string _variant3Result;

        private List<BookAbbreviation> _allBooksAbbreviations;
        private string _allBooksAbbreviationsString;
        private Dictionary<int, string> _allBooksAbbreviationsIndexes;

        public CheckVerseRecognitionVariantsPerfomance()
        {
            _inputText = "амосибытие галатамвкоринф к Коринфск 2Ин".ToLower(); // "Вотором послании к Коринфской церкви";
            ModulesManager = DIContainer.Resolve<IModulesManager>();

            Prepare();            
        }

        private void Prepare()
        {
            _moduleInfo = ModulesManager.UploadModule(@"C:\prj\private\BibleNote v4\BibleNote\dev\trunk\Data\Modules\rst\rst.bnm", "rst");
            ModulesManager.SetCurrentModule("rst");

            _allBooksAbbreviations = new List<BookAbbreviation>();
            foreach(var bibleBook in _moduleInfo.BibleStructure.BibleBooks)
            {
                _allBooksAbbreviations.AddRange(bibleBook.AllAbbreviations.Select(abbr => new BookAbbreviation() { BookInfo = bibleBook, Abbreviation = abbr.Value }));
            }
            _allBooksAbbreviations.ForEach(b => 
                {
                    b.Abbreviation.Value = b.Abbreviation.Value.ToLowerInvariant();
                    b.AbbreviationLength = b.Abbreviation.Value.Length;                    
                });

            _allBooksAbbreviations = _allBooksAbbreviations.OrderByDescending(b => b.AbbreviationLength).ToList();

            _allBooksAbbreviationsIndexes = new Dictionary<int, string>();
            _allBooksAbbreviationsString = string.Empty;
            foreach(var b in _moduleInfo.BibleStructure.BibleBooks)
            {
                foreach(var abbr in b.AllAbbreviations)
                {
                    _allBooksAbbreviationsIndexes.Add(_allBooksAbbreviationsString.Length, b.Name);
                    _allBooksAbbreviationsString += abbr.Value.Value.ToLower() + "|";
                }
            }
        }

        public void RunTests()
        {
            var sw = new Stopwatch();


            sw.Restart();
            for (var i = 0; i < TimesCount; i++)
                _variant1Result = Variant1(_inputText);
            sw.Stop();
            Console.WriteLine("Variant1. ResultBookName = {0}, Elapsed time: {1}", _variant1Result, sw.Elapsed);


            //sw.Restart();
            //for (var i = 0; i < TimesCount; i++)
            //    _variant2Result = Variant2(_inputText);
            //sw.Stop();
            //Console.WriteLine("Variant2. ResultBookName = {0}, Elapsed time: {1}", _variant2Result, sw.Elapsed);


            sw.Restart();            
            for (var i = 0; i < TimesCount; i++)
                _variant3Result = Variant3(_inputText);
            sw.Stop();
            Console.WriteLine("Variant3. ResultBookName = {0}, Elapsed time: {1}", _variant3Result, sw.Elapsed);
        }

        private string Variant1(string text) // the winner!
        {
            var index = -1;
            string moduleName;

            do
            {
                var bibleBookInfo = _moduleInfo.GetBibleBook(text, false, out moduleName);    
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

        private string Variant2(string text)
        {
            var index = -1;

            do
            {
                var bookIndex = _allBooksAbbreviationsString.IndexOf(text);
                if (bookIndex != -1 && _allBooksAbbreviationsIndexes.ContainsKey(bookIndex))
                    return _allBooksAbbreviationsIndexes[bookIndex];
                else
                {
                    index = text.IndexOfAny(new char[] { ' ', ',', '.', ':', '-', '/', '\\', '>', '<', '=' });
                    if (index != -1)
                        text = text.Substring(index + 1);
                }

            } while (index > -1);

            return null;
        }

        private string Variant3(string text)
        {
            var textLength = text.Length;            
            foreach (var b in _allBooksAbbreviations)
            {
                var index = text.LastIndexOf(b.Abbreviation.Value);
                if (index != -1)
                {
                    if (index + b.AbbreviationLength == textLength)
                    {
                        return b.BookInfo.Name;                        
                    }
                }
            }

            return null;
        }
    }
}
