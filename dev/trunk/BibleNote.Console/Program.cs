using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Data;
using BibleNote.Analytics.Services;
using BibleNote.Analytics.Services.Environment;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Analytics.Services.VerseParsing;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace BibleNoteConsole
{    
    class Program
    {
        public static IModulesManager ModulesManager { get; set; }

        private static readonly Regex sWhitespace = new Regex(@"\s+");
        public static string ReplaceWhitespace(string input, string replacement)
        {
            return sWhitespace.Replace(input, replacement);
        }

        static void Main(string[] args)
        {
            //DIContainer.InitWithDefaults();
            //ModulesManager = DIContainer.Resolve<IModulesManager>();

            var sw = new Stopwatch();
          

            try
            {
                //var _moduleInfo = ModulesManager.UploadModule(@"C:\prj\BibleNote v4\dev\trunk\Data\Modules\rst\rst.bnm", "rst");
                //ModulesManager.SetCurrentModule("rst");
                //var bible = ModulesManager.GetCurrentBibleContent();
                //Console.WriteLine(bible.Books.Skip(39).First().Items.Count());

                //Console.WriteLine(bible.Books.Skip(39).SelectMany(b => b.Chapters.SelectMany(c => c.Verses)).Count());

                //for (int i = 0; i <= 10000000; i++)
                //{
                //    var s = "test" + " " + " " + "test";
                //    var r = s.Replace(" ", string.Empty).Replace(" ", string.Empty);
                //    //var r = ReplaceWhitespace(s, string.Empty);
                //    if (r != "testtest")
                //        throw new InvalidOperationException();
                //}

                sw.Start();
                for (var i = 0; i <= 100000; i++)
                {
                    var sb = GetText(i);
                    var q = sb.Replace("aab", " ").ToString();
                }

                sw.Stop();
                Console.WriteLine($"StringBuilder Replace: {sw.Elapsed.TotalSeconds}");

                sw.Start();
                for (var i = 0; i <= 100000; i++)
                {
                    var sb = GetText(i);
                    var q = sb.ToString().Replace("aab", " ");
                }

                sw.Stop();
                Console.WriteLine($"String Replace: {sw.Elapsed.TotalSeconds}");


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

        private static StringBuilder GetText(int length)
        {
            var sb = new StringBuilder();
            for (var i = 0; i <= length; i++)
                sb.Append(i % 50 == 0 ? "b" : "a");

            return sb;
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
