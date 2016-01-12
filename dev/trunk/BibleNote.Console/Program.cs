using BibleNote.Analytics.Contracts;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Data;
using BibleNote.Analytics.Services;
using BibleNote.Analytics.Services.Environment;
using BibleNote.Analytics.Services.System;
using BibleNote.Analytics.Services.VerseParsing;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNoteConsole
{    
    class Program
    {
        public static IModulesManager ModulesManager { get; set; }

        static void Main(string[] args)
        {
            DIContainer.InitWithDefaults();
            ModulesManager = DIContainer.Resolve<IModulesManager>();

            var sw = new Stopwatch();
            sw.Start();

            try
            {   
                var _moduleInfo = ModulesManager.UploadModule(@"C:\prj\BibleNote v4\dev\trunk\Data\Modules\rst\rst.bnm", "rst");
                ModulesManager.SetCurrentModule("rst");
                var bible = ModulesManager.GetCurrentBibleContent();
                Console.WriteLine(bible.Books.Skip(39).First().Items.Count());

                Console.WriteLine(bible.Books.Skip(39).SelectMany(b => b.Chapters.SelectMany(c => c.Verses)).Count());

                //new CheckVerseRecognitionVariantsPerfomance().RunTests();
                //TestChar2IntPerfomance(VerseUtils.GetVerseNumber);                

                //var service = DIContainer.Resolve<IVerseRecognitionService>();
                //var verseEntryInfo = service.TryGetVerse("В этом тексте есть Ин 5:6 и ещё другие стихи, например :7.", 0);
                                
                
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.ToString());
            }

            sw.Stop();

            Console.WriteLine("Finish. Elapsed time: {0}", sw.Elapsed);
            Console.ReadKey();
        }        

        static void TestChar2IntPerfomance(Func<char[], int, int> func)
        {
            var r = new Random();

            for(var i = 0; i < 1000000; i++)
            {
                var digits = new char[3];
                var digitsCount = 1;
                digits[0] = r.Next(0, 10).ToString()[0];

                if (r.Next(0, 2) > 0)
                {
                    digitsCount = 2;
                    digits[1] = r.Next(0, 10).ToString()[0];

                    if (r.Next(0, 2) > 0)
                    {
                        digitsCount = 3;
                        digits[2] = r.Next(0, 10).ToString()[0];
                    }
                }

                var result = func(digits, digitsCount);
            }
        }
    }
}
