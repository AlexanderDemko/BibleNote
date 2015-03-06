using System;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Core.Common;

namespace BibleNote.Tests
{
    [TestClass]
    public class VersePointerTests
    {
        private static void TestVerseParsing(string originalVerse, SimpleVersePointer targetVerse)
        {
          //  var verse = new VersePointer(originalVerse);
          //  Assert.AreEqual(verse, targetVerse);
        }

        [TestMethod]
        public void TestScenario1()
        {
            TestVerseParsing("Ин 1:1", new SimpleVersePointer());
        }
    }
}
