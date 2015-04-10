using BibleNote.Core.Common;
using BibleNote.Core.Services;
using System;
namespace BibleNote.Core.Contracts
{
    public interface IBibleParallelTranslationConnectorManager
    {
        ParallelBibleInfo GetParallelBibleInfo(string baseModuleShortName, string parallelModuleShortName, 
            BibleTranslationDifferences baseBookTranslationDifferences, BibleTranslationDifferences parallelBookTranslationDifferences, bool refreshCache = false);

        ParallelBibleInfo GetParallelBibleInfo(string baseModuleShortName, string parallelModuleShortName, bool refreshCache = false);

        ModuleVersePointer GetParallelVersePointer(ModuleVersePointer baseVersePointer, string baseModuleShortName, string parallelModuleShortName);
    }
}
