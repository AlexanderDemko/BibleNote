using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Data;
using BibleNote.Analytics.Models.Scheme;
using BibleNote.Analytics.Services;
using BibleNote.Analytics.Services.Environment;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Analytics.Services.VerseParsing;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Practices.Unity;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Providers.OneNote.Services;
using AngleSharp.Parser.Html;
using System.Xml.Linq;

namespace BibleNoteConsole
{
    class Program
    {
        public static IVersePointerFactory VersePointerFactory { get; set; }

        public static IModulesManager ModulesManager { get; set; }

        private static readonly Regex sWhitespace = new Regex(@"\s+");
        public static string ReplaceWhitespace(string input, string replacement)
        {
            return sWhitespace.Replace(input, replacement);
        }

        static void Main(string[] args)
        {
            DIContainer.InitWithDefaults();
            DIContainer.Container.RegisterInstance<IConfigurationManager>(new MockConfigurationManager());
            ModulesManager = DIContainer.Resolve<IModulesManager>();
            

            //ConvertTextModule(@"C:\temp\nrkv.txt");
            //SaveTextModule(@"c:\temp\nkrv.txt");
            //return;

            var sw = new Stopwatch();

            try
            {
                var input = @"    
<one:Title selected='partial' lang='ru'>
        <one:OE author='Alexander Demko' authorInitials='AD' lastModifiedBy='Alexander Demko' lastModifiedByInitials='AD' creationTime='2016-09-22T14:59:16.000Z' lastModifiedTime='2016-09-22T14:59:16.000Z' objectID='{3458141B-7E8F-4947-B7D0-238F462B062E}{15}{B0}' alignment='left' quickStyleIndex='0' selected='partial'>
            <one:T>
                <![CDATA[<span lang=en-US>Троица</span><span lang=ru> (</span><span lang=en-US>Ин</span><span lang=ru>1:1)</span>]]>
            </one:T>
            
        </one:OE>
    </one:Title>
    <one:Outline author='Alexander Demko' authorInitials='AD' lastModifiedBy='Alexander Demko' lastModifiedByInitials='AD' lastModifiedTime='2016-09-22T14:58:17.000Z' objectID='{3458141B-7E8F-4947-B7D0-238F462B062E}{134}{B0}'>
        <one:Position x='36.0' y='86.4000015258789' z='0' />
        <one:Size width='540.0' height='174.6240844726562' />
        <one:OEChildren indent='2'>
            <one:OE creationTime='2016-09-22T14:58:17.000Z' lastModifiedTime='2016-09-22T14:58:17.000Z' objectID='{3458141B-7E8F-4947-B7D0-238F462B062E}{135}{B0}' alignment='left' quickStyleIndex='1'>
                <one:List>
                    <one:Bullet bullet='2' fontSize='11.0' />
                </one:List>
                <one:T>
                    <![CDATA[<a href='file:///C:\molitvoslov\'>Молитвы</a>]]>
                </one:T>
            </one:OE>
            <one:OE creationTime='2016-09-22T14:58:17.000Z' lastModifiedTime='2016-09-22T14:58:17.000Z' objectID='{3458141B-7E8F-4947-B7D0-238F462B062E}{140}{B0}' alignment='left' quickStyleIndex='1'>
                <one:List>
                    <one:Bullet bullet='2' fontSize='11.0' />
                </one:List>
                <one:T>
                    <![CDATA[<a href='file:///C:\biblia\'>Библия</a>]]>
                </one:T>
            </one:OE>
        </one:OEChildren> 
";
                var result = Regex.Replace(input, "([^>])(\\n|&nbsp;)([^<])", "$1 $3");
                result = Regex.Replace(result, @"(<!\[CDATA\[)(((?!one:).)*)(]]>)", "$2");




                var xdoc = XDocument.Parse(File.ReadAllText(@"..\..\HTMLPage1.html"));

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

        private static void SaveTextModule(string filePath)
        {
            using (var sw = new StreamWriter(filePath + "_", false, Encoding.UTF8))
            {
                foreach (var line in File.ReadAllLines(filePath, Encoding.GetEncoding("EUC-KR")))
                {
                    sw.WriteLine(line);
                }
                sw.Close();
            }
        }

        private static void ConvertTextModule(string filePath)
        {
            List<BIBLEBOOK> books = new List<BIBLEBOOK>();
            List<CHAPTER> chapters = null;
            List<VERS> verses = null;

            BIBLEBOOK latestBook = null;
            CHAPTER latestChapter = null;

            foreach (var line in File.ReadAllLines(filePath, Encoding.UTF8)) //GetEncoding("EUC-KR")))
            {
                try
                {
                    string verseText;
                    var verse = GetVerse(line, out verseText);
                    if (verse == null)
                    {
                        verses.Last().Items[0] = (string)verses.Last().Items[0] + " " + line;
                        continue;
                    }

                    if (latestChapter == null || latestBook == null
                        || verse.Chapter.ToString() != latestChapter.cnumber || verse.BookIndex != latestBook.Index)
                    {
                        if (latestBook == null || verse.BookIndex != latestBook.Index)
                        {
                            if (latestBook != null)
                                latestBook.Items = chapters.ToArray();

                            latestBook = new BIBLEBOOK() { bnumber = verse.BookIndex.ToString() };
                            books.Add(latestBook);

                            chapters = new List<CHAPTER>();
                        }

                        if (latestChapter != null)
                            latestChapter.Items = verses.ToArray();

                        latestChapter = new CHAPTER() { cnumber = verse.Chapter.ToString() };
                        chapters.Add(latestChapter);

                        verses = new List<VERS>();
                    }

                    verses.Add(new VERS() { vnumber = verse.Verse.ToString(), Items = new string[] { verseText } });
                }
                catch (InvalidProgramException)
                { }
            }

            latestBook.Items = chapters.ToArray();
            latestChapter.Items = verses.ToArray();

            var bible = new XMLBIBLE() { BIBLEBOOK = books.ToArray() };

            XmlUtils.SaveToXmlFile(bible, Path.Combine(Path.GetDirectoryName(filePath), Path.GetFileNameWithoutExtension(filePath) + ".xml"));
        }

        private static VersePointer GetVerse(string line, out string verseText)
        {
            verseText = null;

            if (line.Length == 4 && line[3] == ' ')
                throw new InvalidProgramException();

            var i = line.IndexOf(' ', 4);
            var verseString = line.Substring(0, i);
            verseText = line.Substring(i + 1);

            return VersePointerFactory.CreateVersePointer(verseString);
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

            for (var i = 0; i < 1000000; i++)
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
