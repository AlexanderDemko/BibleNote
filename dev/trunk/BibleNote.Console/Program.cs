using BibleNote.Analytics.Data;
using BibleNote.Analytics.Services;
using BibleNote.Analytics.Services.System;
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
        static void Main(string[] args)
        {
            DIContainer.InitWithDefaults();
            var sw = new Stopwatch();
            sw.Start();

            try
            {
                var tester = new CheckVerseRecognitionVariantsPerfomance();
                tester.RunTests();
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.ToString());
            }

            sw.Stop();

            Console.WriteLine("Finish. Elapsed time: {0}", sw.Elapsed);
            Console.ReadKey();
        }        
    }
}
