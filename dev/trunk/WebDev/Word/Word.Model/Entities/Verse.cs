﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Word.Model.Entities
{    
    public class Verse:WordObjectBase
    {
        public List<Word> Words { get; set; }
    }
}
